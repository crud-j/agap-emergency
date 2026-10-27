import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeRoleDto } from '../../src/administration/dto/admin-requests.dto';
import { SendMessageDto } from '../../src/communications/dto/send-message.dto';
import { SurgeBroadcastDto, UpdateTriageTagDto } from '../../src/disaster-mode/dto/surge-actions.dto';
import { FacilityStatusDto } from '../../src/facilities/dto/facility-status.dto';
import {
  AddAgencyDto, AssignIcsPositionDto, IncidentFeedbackDto, MergeIncidentDto, UpdateIcsDto,
} from '../../src/incidents/dto/incident-actions.dto';
import { RespondRequestDto } from '../../src/resources/dto/request-decision.dto';
import { ScheduleAnnouncementDto } from '../../src/announcements/dto/announcement-actions.dto';
import { UpdateOrganizationDto } from '../../src/organizations/dto/update-organization.dto';

const UUID = '6f1c1c39-7d43-4a8e-9d4e-2f1b3c0a9b11';

async function errors(cls: new () => object, body: object): Promise<string[]> {
  return (await validate(plainToInstance(cls, body))).map((e) => e.property).sort();
}

/**
 * Routes that used inline body types were never validated (Nest sees `Object`).
 * Each now has a DTO: bad input is a 400 with the field named, not a database error.
 */
describe('request DTOs that replaced inline body types', () => {
  it.each<[string, new () => object, object, object, string[]]>([
    ['ChangeRoleDto', ChangeRoleDto, { role: 'DISPATCHER' }, { role: 'SUPERUSER' }, ['role']],
    ['SendMessageDto', SendMessageDto, { messageText: 'On our way' }, { messageText: 'x'.repeat(2001) }, ['messageText']],
    ['SurgeBroadcastDto', SurgeBroadcastDto, { surgeId: UUID, message: 'All units report' }, { surgeId: 'abc', message: '' }, ['message', 'surgeId']],
    ['FacilityStatusDto', FacilityStatusDto, { receivingStatus: 'OPEN', capacityAvailable: 3 }, { receivingStatus: 'FULL', capacityAvailable: -1 }, ['capacityAvailable', 'receivingStatus']],
    ['AddAgencyDto', AddAgencyDto, { organizationId: UUID }, { organizationId: 'BFP' }, ['organizationId']],
    ['AssignIcsPositionDto', AssignIcsPositionDto, { userId: UUID, position: 'SAFETY_OFFICER' }, { userId: UUID, position: 'MAYOR' }, ['position']],
    ['UpdateIcsDto', UpdateIcsDto, { situationNotes: null, objectives: ['Contain fire'] }, { objectives: 'Contain fire' }, ['objectives']],
    ['MergeIncidentDto', MergeIncidentDto, { masterIncidentId: UUID }, {}, ['masterIncidentId']],
    ['IncidentFeedbackDto', IncidentFeedbackDto, { overallRating: 5 }, { overallRating: 9 }, ['overallRating']],
    ['RespondRequestDto', RespondRequestDto, { accept: true }, { accept: 'yes' }, ['accept']],
    ['ScheduleAnnouncementDto', ScheduleAnnouncementDto, { scheduledAt: '2026-10-24T08:00:00+08:00' }, { scheduledAt: 'tomorrow' }, ['scheduledAt']],
  ])('%s accepts valid input and names the bad field', async (_name, cls, good, bad, badFields) => {
    expect(await errors(cls, good)).toEqual([]);
    expect(await errors(cls, bad)).toEqual(badFields);
  });

  it('partial update DTOs keep the create rules (empty body is fine)', async () => {
    expect(await errors(UpdateOrganizationDto, {})).toEqual([]);
    expect(await errors(UpdateTriageTagDto, {})).toEqual([]);
  });
});
