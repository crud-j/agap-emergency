import 'dotenv/config';
import {
  PrismaClient,
  dispatch_status,
  facility_receiving_status,
  facility_type,
  incident_category,
  incident_priority,
  incident_status,
  organization_type,
  resource_status,
  resource_type,
  user_role,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = 'AgapDev2026!';

async function main() {
  console.log('Seeding AGAP database...');

  const devHash = await bcrypt.hash(DEV_PASSWORD, 12);
  const adminHash = await bcrypt.hash(
    process.env['INITIAL_ADMIN_PASSWORD'] ?? 'ChangeThisPasswordImmediately!',
    12,
  );

  // ── Users ──────────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local' },
    update: {},
    create: {
      full_name: 'System Administrator',
      email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local',
      password_hash: adminHash,
      role: user_role.SYSTEM_ADMINISTRATOR,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  const dispatcher1 = await prisma.user.upsert({
    where: { email: 'dispatcher1@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Juan dela Cruz',
      email: 'dispatcher1@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234001',
      password_hash: devHash,
      role: user_role.DISPATCHER,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  const dispatcher2 = await prisma.user.upsert({
    where: { email: 'dispatcher2@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Maria Santos',
      email: 'dispatcher2@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234002',
      password_hash: devHash,
      role: user_role.DISPATCHER,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Roberto Reyes',
      email: 'supervisor@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234003',
      password_hash: devHash,
      role: user_role.SUPERVISOR,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  const responder1 = await prisma.user.upsert({
    where: { email: 'responder1@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Jose Mendoza',
      email: 'responder1@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234004',
      password_hash: devHash,
      role: user_role.RESPONDER,
      is_email_verified: true,
      barangay: 'Lolomboy',
    },
  });

  const responder2 = await prisma.user.upsert({
    where: { email: 'responder2@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Ana Garcia',
      email: 'responder2@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234005',
      password_hash: devHash,
      role: user_role.RESPONDER,
      is_email_verified: true,
      barangay: 'Bunlo',
    },
  });

  const responder3 = await prisma.user.upsert({
    where: { email: 'responder3@bfp.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Carlos Bautista',
      email: 'responder3@bfp.bocaue.gov.ph',
      phone_number: '+639171234006',
      password_hash: devHash,
      role: user_role.RESPONDER,
      is_email_verified: true,
      barangay: 'Bundukan',
    },
  });

  const hospitalUser = await prisma.user.upsert({
    where: { email: 'receiving@bocauehospital.gov.ph' },
    update: {},
    create: {
      full_name: 'Dr. Luz Aquino',
      email: 'receiving@bocauehospital.gov.ph',
      phone_number: '+639171234007',
      password_hash: devHash,
      role: user_role.HOSPITAL_USER,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  const publisher = await prisma.user.upsert({
    where: { email: 'announcements@lgu.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'LGU Information Officer',
      email: 'announcements@lgu.bocaue.gov.ph',
      phone_number: '+639171234008',
      password_hash: devHash,
      role: user_role.ANNOUNCEMENTS_PUBLISHER,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  console.log('  Users done');

  // ── Organizations ──────────────────────────────────────────────────────────

  const mdrrmo = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0001-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000001',
      name: 'Bocaue Municipal Disaster Risk Reduction and Management Office',
      short_name: 'MDRRMO Bocaue',
      organization_type: organization_type.MDRRMO,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Poblacion',
      address: 'Municipal Hall, Poblacion, Bocaue, Bulacan',
      contact_number: '+63446931234',
      email: 'mdrrmo@bocaue.gov.ph',
      is_active: true,
    },
  });

  const bfp = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0001-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000002',
      name: 'Bureau of Fire Protection — Bocaue Fire Station',
      short_name: 'BFP Bocaue',
      organization_type: organization_type.BFP,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Poblacion',
      address: 'MacArthur Highway, Bocaue, Bulacan',
      contact_number: '+63446935678',
      email: 'bfp.bocaue@bfp.gov.ph',
      is_active: true,
    },
  });

  const hospitalOrg = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0001-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000003',
      name: 'Bocaue General Hospital',
      short_name: 'BGH',
      organization_type: organization_type.HOSPITAL,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Poblacion',
      address: 'Gov. F. Halili Avenue, Bocaue, Bulacan',
      contact_number: '+63446939012',
      email: 'info@bocauehospital.gov.ph',
      is_active: true,
    },
  });

  console.log('  Organizations done');

  // ── Organization Memberships ───────────────────────────────────────────────

  const memberships = [
    { org: mdrrmo.id, user: dispatcher1.id },
    { org: mdrrmo.id, user: dispatcher2.id },
    { org: mdrrmo.id, user: supervisor.id },
    { org: mdrrmo.id, user: responder1.id },
    { org: mdrrmo.id, user: responder2.id },
    { org: bfp.id, user: responder3.id },
    { org: hospitalOrg.id, user: hospitalUser.id },
  ];

  for (const m of memberships) {
    await prisma.organization_memberships.upsert({
      where: {
        organization_id_user_id: {
          organization_id: m.org,
          user_id: m.user,
        },
      },
      update: {},
      create: { organization_id: m.org, user_id: m.user, is_active: true },
    });
  }

  console.log('  Organization memberships done');

  // ── Facilities ─────────────────────────────────────────────────────────────

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      organization_id: hospitalOrg.id,
      name: 'Bocaue General Hospital',
      facility_type: facility_type.HOSPITAL,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Poblacion',
      address: 'Gov. F. Halili Avenue, Bocaue, Bulacan',
      contact_number: '+63446939012',
      emergency_contact: '+63446939013',
      receiving_status: facility_receiving_status.OPEN,
      has_emergency_room: true,
      has_icu: true,
      blood_bank: true,
      is_evacuation_center: false,
      is_active: true,
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000002',
      name: 'Lolomboy Barangay Hall Evacuation Center',
      facility_type: facility_type.EVACUATION_CENTER,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Lolomboy',
      receiving_status: facility_receiving_status.OPEN,
      is_evacuation_center: true,
      elevation_masl: 12.5,
      is_active: true,
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000003',
      name: 'Bambang Evacuation Center',
      facility_type: facility_type.EVACUATION_CENTER,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Bambang',
      receiving_status: facility_receiving_status.OPEN,
      is_evacuation_center: true,
      elevation_masl: 11.0,
      is_active: true,
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000004',
      name: 'Bunlo Barangay Hall',
      facility_type: facility_type.BARANGAY_HALL,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Bunlo',
      receiving_status: facility_receiving_status.OPEN,
      is_evacuation_center: true,
      elevation_masl: 10.5,
      is_active: true,
    },
  });

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000005' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000005',
      name: 'Igulot Evacuation Center',
      facility_type: facility_type.EVACUATION_CENTER,
      municipality: 'Bocaue',
      province: 'Bulacan',
      barangay: 'Igulot',
      receiving_status: facility_receiving_status.OPEN,
      is_evacuation_center: true,
      elevation_masl: 11.8,
      is_active: true,
    },
  });

  console.log('  Facilities done');

  // ── Vehicles ───────────────────────────────────────────────────────────────

  const amb1 = await prisma.vehicle.upsert({
    where: { plate_number: 'AGB-1001' },
    update: {},
    create: {
      organization_id: mdrrmo.id,
      plate_number: 'AGB-1001',
      unit_code: 'MDRRMO-AMB-01',
      resource_type: resource_type.AMBULANCE,
      make: 'Toyota',
      model: 'Hi-Ace Ambulance',
      year: 2022,
      capacity_persons: 4,
      is_active: true,
    },
  });

  const amb2 = await prisma.vehicle.upsert({
    where: { plate_number: 'AGB-1002' },
    update: {},
    create: {
      organization_id: mdrrmo.id,
      plate_number: 'AGB-1002',
      unit_code: 'MDRRMO-AMB-02',
      resource_type: resource_type.AMBULANCE,
      make: 'Toyota',
      model: 'Hi-Ace Ambulance',
      year: 2021,
      capacity_persons: 4,
      is_active: true,
    },
  });

  const boat1 = await prisma.vehicle.upsert({
    where: { plate_number: 'RB-BOC-01' },
    update: {},
    create: {
      organization_id: mdrrmo.id,
      plate_number: 'RB-BOC-01',
      unit_code: 'MDRRMO-RB-01',
      resource_type: resource_type.RESCUE_BOAT,
      make: 'Yamaha',
      model: 'Rescue Inflatable',
      year: 2023,
      capacity_persons: 8,
      is_active: true,
    },
  });

  const ft1 = await prisma.vehicle.upsert({
    where: { plate_number: 'BFP-BOC-01' },
    update: {},
    create: {
      organization_id: bfp.id,
      plate_number: 'BFP-BOC-01',
      unit_code: 'BFP-FT-01',
      resource_type: resource_type.FIRE_TRUCK,
      make: 'Isuzu',
      model: 'Forward Fire Truck',
      year: 2020,
      capacity_persons: 6,
      is_active: true,
    },
  });

  const rt1 = await prisma.vehicle.upsert({
    where: { plate_number: 'BFP-BOC-02' },
    update: {},
    create: {
      organization_id: bfp.id,
      plate_number: 'BFP-BOC-02',
      unit_code: 'BFP-RT-01',
      resource_type: resource_type.RESCUE_TRUCK,
      make: 'Mitsubishi',
      model: 'Fuso Rescue Truck',
      year: 2021,
      capacity_persons: 6,
      is_active: true,
    },
  });

  console.log('  Vehicles done');

  // ── Resources ──────────────────────────────────────────────────────────────

  await prisma.resources.upsert({
    where: { id: '00000000-0000-0000-0003-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000001',
      organization_id: mdrrmo.id,
      vehicle_id: amb1.id,
      name: 'MDRRMO Ambulance 1',
      call_sign: 'ALPHA-1',
      resource_type: resource_type.AMBULANCE,
      base_barangay: 'Poblacion',
      is_active: true,
    },
  });

  await prisma.resources.upsert({
    where: { id: '00000000-0000-0000-0003-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000002',
      organization_id: mdrrmo.id,
      vehicle_id: amb2.id,
      name: 'MDRRMO Ambulance 2',
      call_sign: 'ALPHA-2',
      resource_type: resource_type.AMBULANCE,
      base_barangay: 'Lolomboy',
      is_active: true,
    },
  });

  await prisma.resources.upsert({
    where: { id: '00000000-0000-0000-0003-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000003',
      organization_id: mdrrmo.id,
      vehicle_id: boat1.id,
      name: 'MDRRMO Rescue Boat 1',
      call_sign: 'BRAVO-1',
      resource_type: resource_type.RESCUE_BOAT,
      base_barangay: 'Lolomboy',
      is_active: true,
    },
  });

  await prisma.resources.upsert({
    where: { id: '00000000-0000-0000-0003-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000004',
      organization_id: bfp.id,
      vehicle_id: ft1.id,
      name: 'BFP Fire Truck 1',
      call_sign: 'CHARLIE-1',
      resource_type: resource_type.FIRE_TRUCK,
      base_barangay: 'Poblacion',
      is_active: true,
    },
  });

  await prisma.resources.upsert({
    where: { id: '00000000-0000-0000-0003-000000000005' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000005',
      organization_id: bfp.id,
      vehicle_id: rt1.id,
      name: 'BFP Rescue Truck 1',
      call_sign: 'CHARLIE-2',
      resource_type: resource_type.RESCUE_TRUCK,
      base_barangay: 'Poblacion',
      is_active: true,
    },
  });

  console.log('  Resources done');

  // ── SLA Policies ───────────────────────────────────────────────────────────

  const slaPolicies = [
    {
      id: '00000000-0000-0000-0004-000000000001',
      priority: incident_priority.CRITICAL,
      acknowledge_threshold_secs: 60,
      dispatch_threshold_secs: 120,
      on_scene_threshold_secs: 600,
    },
    {
      id: '00000000-0000-0000-0004-000000000002',
      priority: incident_priority.HIGH,
      acknowledge_threshold_secs: 120,
      dispatch_threshold_secs: 300,
      on_scene_threshold_secs: 900,
    },
    {
      id: '00000000-0000-0000-0004-000000000003',
      priority: incident_priority.MEDIUM,
      acknowledge_threshold_secs: 300,
      dispatch_threshold_secs: 600,
      on_scene_threshold_secs: 1800,
    },
    {
      id: '00000000-0000-0000-0004-000000000004',
      priority: incident_priority.LOW,
      acknowledge_threshold_secs: 600,
      dispatch_threshold_secs: 1200,
      on_scene_threshold_secs: 3600,
    },
  ];

  for (const policy of slaPolicies) {
    await prisma.sla_policies.upsert({
      where: { id: policy.id },
      update: {},
      create: { ...policy, organization_id: mdrrmo.id, is_active: true },
    });
  }

  console.log('  SLA policies done');

  // ── System Configurations ──────────────────────────────────────────────────

  const configs: Array<{ key: string; value: string | number | boolean; description: string }> = [
    {
      key: 'bocaue_river_critical_level_meters',
      value: 11.5,
      description: 'Bocaue River mandatory evacuation trigger level in meters',
    },
    {
      key: 'sms_enabled',
      value: true,
      description: 'Enable Semaphore SMS dual-path delivery',
    },
    {
      key: 'default_language',
      value: 'fil',
      description: 'Default system language',
    },
    {
      key: 'sos_cancel_window_seconds',
      value: 10,
      description: 'Seconds citizen has to cancel after SOS trigger',
    },
    {
      key: 'max_offline_queue_age_hours',
      value: 24,
      description: 'Maximum age of offline queue items before discard',
    },
    {
      key: 'eta_update_interval_seconds',
      value: 30,
      description: 'How often to recalculate ETA for active dispatches',
    },
    {
      key: 'duplicate_detection_radius_meters',
      value: 200,
      description: 'Radius within which a new incident may be flagged as duplicate',
    },
  ];

  for (const c of configs) {
    await prisma.system_configurations.upsert({
      where: { config_key: c.key },
      update: {},
      create: {
        config_key: c.key,
        config_value: c.value,
        description: c.description,
        is_sensitive: false,
        updated_by_id: admin.id,
      },
    });
  }

  console.log('  System configurations done');

  // ── Demo dispatch (dev testing) ──────────────────────────────────────────────
  // A ready-to-track scenario so the full dispatch → tracking flow can be tested
  // without the Operations Center: a citizen-reported incident with ALPHA-1
  // (MDRRMO Ambulance 1) already dispatched and responder1 crewed on it.
  // Idempotent — fixed ids, so re-seeding never duplicates and never clobbers an
  // in-progress test (status updates are preserved via empty `update`).

  const ALPHA1_RESOURCE_ID = '00000000-0000-0000-0003-000000000001';
  const DEMO_INCIDENT_ID = '00000000-0000-0000-0005-000000000001';
  const DEMO_DISPATCH_ID = '00000000-0000-0000-0006-000000000001';

  const demoCitizen = await prisma.user.upsert({
    where: { email: 'citizen@demo.agap' },
    update: {},
    create: {
      full_name: 'Demo Citizen',
      email: 'citizen@demo.agap',
      phone_number: '+639170000001',
      password_hash: devHash,
      role: user_role.CITIZEN,
      is_email_verified: true,
      barangay: 'Turo',
    },
  });

  await prisma.incident.upsert({
    where: { id: DEMO_INCIDENT_ID },
    update: {},
    create: {
      id: DEMO_INCIDENT_ID,
      public_reference: 'INC-2026-DEMO01',
      category: incident_category.MEDICAL,
      priority: incident_priority.HIGH,
      status: incident_status.DISPATCHED,
      description: 'Demo: chest pain, conscious and breathing. (Seeded test incident.)',
      number_of_patients: 1,
      dispatched_at: new Date(),
      incident_reporters: {
        create: {
          user_id: demoCitizen.id,
          is_guest: false,
          reporter_name: 'Demo Citizen',
          reporter_phone: '+639170000001',
        },
      },
      incident_locations: {
        create: {
          latitude: 14.7969,
          longitude: 120.9268,
          formatted_address: 'Villa Zaragoza, Turo, Bocaue, Bulacan',
          barangay: 'Turo',
          municipality: 'Bocaue',
          province: 'Bulacan',
        },
      },
    },
  });

  await prisma.dispatches.upsert({
    where: { id: DEMO_DISPATCH_ID },
    update: {},
    create: {
      id: DEMO_DISPATCH_ID,
      incident_id: DEMO_INCIDENT_ID,
      resource_id: ALPHA1_RESOURCE_ID,
      dispatcher_id: dispatcher1.id,
      organization_id: mdrrmo.id,
      status: dispatch_status.SENT,
      sent_at: new Date(),
      dispatch_notes: 'Demo dispatch — ALPHA-1 (MDRRMO Ambulance 1) to a medical call.',
      dispatch_crew: {
        create: { user_id: responder1.id, role_on_scene: 'Lead Responder' },
      },
    },
  });

  // Reflect the dispatch on the unit so it isn't offered as AVAILABLE again.
  await prisma.resources.update({
    where: { id: ALPHA1_RESOURCE_ID },
    data: { status: resource_status.DISPATCHED, current_incident_id: DEMO_INCIDENT_ID },
  });

  console.log('  Demo dispatch done (ALPHA-1 -> INC-2026-DEMO01, crew: responder1)');

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\nAGAP seed complete.');
  console.log('  Admin:', process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local');
  console.log('  Dev password (all other users):', DEV_PASSWORD);
  console.log('  Organizations: MDRRMO Bocaue, BFP Bocaue, Bocaue General Hospital');
  console.log('  Resources: 2 ambulances, 1 rescue boat, 1 fire truck, 1 rescue truck');
  console.log('  Facilities: BGH + 4 evacuation centers (Lolomboy, Bambang, Bunlo, Igulot)');
  console.log('\n  Demo dispatch flow (ready to track end-to-end):');
  console.log('    Rescuer : responder1@mdrrmo.bocaue.gov.ph /', DEV_PASSWORD, '(crewed on ALPHA-1)');
  console.log('    Citizen : citizen@demo.agap /', DEV_PASSWORD, '(reporter of INC-2026-DEMO01)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
