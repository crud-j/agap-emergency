import { AssessmentService } from '../../src/incidents/assessment/assessment.service';
import { SubmitAssessmentDto } from '../../src/incidents/assessment/dto/submit-assessment.dto';

describe('AssessmentService.submit (MOD-37)', () => {
  const txCreate = jest.fn();
  const txIncidentUpdate = jest.fn();
  const txTriageCreate = jest.fn();

  const prisma = {
    incident: { findUnique: jest.fn() },
    dispatches: { findFirst: jest.fn() },
    surge_incidents: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const realtime = { assessmentUpdated: jest.fn(), triageTagUpdated: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new AssessmentService(prisma as any, realtime as any, audit as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.incident.findUnique.mockResolvedValue({ id: 'inc-1', number_of_patients: 1 });
    // The responder is on an active crew for the incident; no surge is active.
    prisma.dispatches.findFirst.mockResolvedValue({ id: 'disp-1' });
    prisma.surge_incidents.findFirst.mockResolvedValue(null);
    txTriageCreate.mockResolvedValue({});
    txCreate.mockImplementation((args: any) =>
      Promise.resolve({
        id: 'asm-1',
        assessed_at: new Date('2026-10-07T10:00:00Z'),
        consciousness_state: args.data.consciousness_state,
        breathing_status: args.data.breathing_status,
      }),
    );
    txIncidentUpdate.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn: (tx: any) => unknown) =>
      fn({
        on_scene_assessments: { create: txCreate },
        incident: { update: txIncidentUpdate },
        triage_tags: { create: txTriageCreate },
      }),
    );
  });

  it('refuses a responder who is not on an active crew for the incident', async () => {
    prisma.dispatches.findFirst.mockResolvedValue(null);
    await expect(makeService().submit('inc-1', {}, 'resp-9')).rejects.toThrow(/not on an active crew/);
    expect(txCreate).not.toHaveBeenCalled();
  });

  it('files the START tag on the active surge and links the incident (MOD-52)', async () => {
    prisma.surge_incidents.findFirst.mockResolvedValue({ id: 'surge-1' });
    txTriageCreate.mockResolvedValue({ id: 'tag-1', surge_id: 'surge-1' });
    await makeService().submit('inc-1', { triageTag: 'RED', patientId: undefined }, 'resp-1');
    expect(txTriageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ surge_id: 'surge-1', incident_id: 'inc-1', triage_color: 'RED', tagged_by_id: 'resp-1' }),
    });
    expect(txIncidentUpdate).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { surge_incident_id: 'surge-1', is_surge_incident: true },
    });
    // The surge triage board refreshes live (AUTOMATION_NEEDS_PLAN Phase 2, C2): IDs only.
    expect(realtime.triageTagUpdated).toHaveBeenCalledWith({ surgeId: 'surge-1', tagId: 'tag-1' });
  });

  it('keeps the tag on the assessment only when no surge is active', async () => {
    await makeService().submit('inc-1', { triageTag: 'GREEN' }, 'resp-1');
    expect(txTriageCreate).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ triage_tag: 'GREEN' }) });
    expect(realtime.triageTagUpdated).not.toHaveBeenCalled();
  });

  it('persists a full assessment and maps vitals to columns', async () => {
    const dto: SubmitAssessmentDto = {
      consciousnessState: 'ALTERED',
      breathingStatus: 'DIFFICULTY',
      vitals: { bloodPressureSys: 120, bloodPressureDia: 80, pulseBpm: 92, oxygenSaturation: 95, gcsScore: 13 },
      numberOfPatients: 2,
      notes: 'Patient disoriented',
      visibleInjuries: ['laceration to forehead'],
      interventions: ['oxygen administered'],
      triageTag: 'YELLOW',
    };

    await makeService().submit('inc-1', dto, 'responder-1');

    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          incident_id: 'inc-1',
          assessed_by_id: 'responder-1',
          consciousness_state: 'ALTERED',
          breathing_status: 'DIFFICULTY',
          blood_pressure_sys: 120,
          pulse_bpm: 92,
          oxygen_saturation: 95,
          gcs_score: 13,
          triage_tag: 'YELLOW',
          assessment_notes: 'Patient disoriented',
        }),
      }),
    );
    // number_of_patients updates the incident, not the assessment row
    expect(txIncidentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inc-1' }, data: { number_of_patients: 2 } }),
    );
  });

  it('audits (MOD-37) and emits incident.assessment_updated after commit', async () => {
    await makeService().submit('inc-1', { consciousnessState: 'CONSCIOUS' }, 'responder-1');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', moduleId: 'MOD-37', incidentId: 'inc-1' }),
    );
    expect(realtime.assessmentUpdated).toHaveBeenCalledWith(
      'inc-1',
      expect.objectContaining({ assessmentId: 'asm-1', consciousnessState: 'CONSCIOUS' }),
    );
  });

  it('accepts an empty assessment — missing fields never block', async () => {
    await expect(makeService().submit('inc-1', {}, 'responder-1')).resolves.toBeDefined();

    // No numberOfPatients → incident is not touched; arrays default to empty.
    expect(txIncidentUpdate).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visible_injuries: [], interventions: [] }),
      }),
    );
  });

  it('throws when the incident does not exist', async () => {
    prisma.incident.findUnique.mockResolvedValue(null);
    await expect(makeService().submit('missing', {}, 'responder-1')).rejects.toThrow(/not found/);
  });

  it('does not throw if the audit write fails (best-effort, never blocks)', async () => {
    audit.log.mockRejectedValueOnce(new Error('audit down'));
    await expect(makeService().submit('inc-1', {}, 'responder-1')).resolves.toBeDefined();
  });

  it('does not throw if the realtime emit fails (best-effort)', async () => {
    realtime.assessmentUpdated.mockImplementationOnce(() => {
      throw new Error('ws down');
    });
    await expect(makeService().submit('inc-1', {}, 'responder-1')).resolves.toBeDefined();
  });
});
