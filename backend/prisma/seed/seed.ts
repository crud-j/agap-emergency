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

  const orgAdmin = await prisma.user.upsert({
    where: { email: 'orgadmin@mdrrmo.bocaue.gov.ph' },
    update: {},
    create: {
      full_name: 'Elena Villanueva',
      email: 'orgadmin@mdrrmo.bocaue.gov.ph',
      phone_number: '+639171234009',
      password_hash: devHash,
      role: user_role.ORG_ADMINISTRATOR,
      is_email_verified: true,
      barangay: 'Poblacion',
    },
  });

  // Bystander — a demo account for the "report for someone else" flow. Real
  // bystanders never need an account (CLAUDE.md rule 14); this exists only so
  // Ops can exercise every role end-to-end.
  const bystander = await prisma.user.upsert({
    where: { email: 'bystander@demo.agap' },
    update: {},
    create: {
      full_name: 'Demo Bystander',
      email: 'bystander@demo.agap',
      phone_number: '+639170000002',
      password_hash: devHash,
      role: user_role.BYSTANDER,
      is_email_verified: true,
      barangay: 'Wakas',
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
    { org: mdrrmo.id, user: orgAdmin.id },
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

  // ── Resource Capabilities (MOD-29 capability matrix) ─────────────────────────
  // Capability names mirror CAPABILITY_MATRIX in
  // backend/src/dispatch/resource-matching/resource-matching.service.ts so the
  // suitable-unit recommender (MOD-30) produces meaningful matches against the
  // seeded units.

  const CAPABILITY_DEFS: Array<{ name: string; category: string; description: string }> = [
    { name: 'MEDICAL_RESPONSE', category: 'MEDICAL', description: 'Emergency medical response (EMT/BLS)' },
    { name: 'FIRST_AID',        category: 'MEDICAL', description: 'Basic first aid' },
    { name: 'PATIENT_TRANSPORT',category: 'MEDICAL', description: 'Patient transport to a receiving facility' },
    { name: 'ROAD_RESCUE',      category: 'RESCUE',  description: 'Vehicular extrication / road crash rescue' },
    { name: 'SEARCH_AND_RESCUE',category: 'RESCUE',  description: 'Search and rescue operations' },
    { name: 'ROPE_RESCUE',      category: 'RESCUE',  description: 'Technical rope / high-angle rescue' },
    { name: 'WATER_RESCUE',     category: 'FLOOD',   description: 'Swift-water and flood rescue' },
    { name: 'BOAT_OPERATION',   category: 'FLOOD',   description: 'Rescue boat operation' },
    { name: 'FIREFIGHTING',     category: 'FIRE',    description: 'Structural firefighting' },
    { name: 'FIRE_SUPPRESSION', category: 'FIRE',    description: 'Fire suppression and containment' },
    { name: 'RESCUE',           category: 'RESCUE',  description: 'General rescue capability' },
    { name: 'HAZMAT',           category: 'INDUSTRIAL', description: 'Hazardous materials response' },
    { name: 'HEAVY_EQUIPMENT',  category: 'DEBRIS',  description: 'Heavy clearing equipment operation' },
  ];

  const capabilityIdByName = new Map<string, string>();
  for (const cap of CAPABILITY_DEFS) {
    const row = await prisma.resource_capabilities.upsert({
      where: { name: cap.name },
      update: {},
      create: { name: cap.name, category: cap.category, description: cap.description },
    });
    capabilityIdByName.set(cap.name, row.id);
  }

  // Assign verified capabilities to each seeded unit.
  const RES_ALPHA1 = '00000000-0000-0000-0003-000000000001';
  const RES_ALPHA2 = '00000000-0000-0000-0003-000000000002';
  const RES_BRAVO1 = '00000000-0000-0000-0003-000000000003';
  const RES_CHARLIE1 = '00000000-0000-0000-0003-000000000004';
  const RES_CHARLIE2 = '00000000-0000-0000-0003-000000000005';

  const capabilityAssignments: Array<{ resource: string; caps: string[] }> = [
    { resource: RES_ALPHA1,   caps: ['MEDICAL_RESPONSE', 'FIRST_AID', 'PATIENT_TRANSPORT'] },
    { resource: RES_ALPHA2,   caps: ['MEDICAL_RESPONSE', 'FIRST_AID', 'PATIENT_TRANSPORT', 'ROAD_RESCUE'] },
    { resource: RES_BRAVO1,   caps: ['WATER_RESCUE', 'BOAT_OPERATION', 'SEARCH_AND_RESCUE'] },
    { resource: RES_CHARLIE1, caps: ['FIREFIGHTING', 'FIRE_SUPPRESSION', 'RESCUE', 'HAZMAT'] },
    { resource: RES_CHARLIE2, caps: ['SEARCH_AND_RESCUE', 'ROPE_RESCUE', 'ROAD_RESCUE', 'RESCUE'] },
  ];

  for (const assignment of capabilityAssignments) {
    for (const capName of assignment.caps) {
      const capId = capabilityIdByName.get(capName);
      if (!capId) continue;
      await prisma.resource_capability_assignments.upsert({
        where: {
          resource_id_capability_id: {
            resource_id: assignment.resource,
            capability_id: capId,
          },
        },
        update: {},
        create: {
          resource_id: assignment.resource,
          capability_id: capId,
          is_verified: true,
        },
      });
    }
  }

  console.log('  Resource capabilities done (13 capabilities, 5 units mapped — MOD-29)');

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

  // ── Permissions & role mappings (MOD-47) ─────────────────────────────────────
  // The permissions catalog that the Roles & Permissions admin screen grants and
  // revokes. Without this seed the catalog is empty and the screen has nothing to
  // manage. Idempotent: upsert on the unique `name`.

  const PERMISSION_DEFS: Array<{ name: string; module: string; description: string }> = [
    { name: 'incident.view',        module: 'MOD-14', description: 'View incident records' },
    { name: 'incident.acknowledge', module: 'MOD-15', description: 'Acknowledge a received incident' },
    { name: 'incident.assess',      module: 'MOD-25', description: 'Assess / validate an incident' },
    { name: 'incident.dispatch',    module: 'MOD-31', description: 'Move an incident to dispatch' },
    { name: 'incident.resolve',     module: 'MOD-45', description: 'Record an incident resolution' },
    { name: 'incident.close',       module: 'MOD-45', description: 'Close an incident' },
    { name: 'dispatch.create',      module: 'MOD-31', description: 'Authorize and create a dispatch' },
    { name: 'dispatch.cancel',      module: 'MOD-31', description: 'Cancel or reassign a dispatch' },
    { name: 'escalation.ack',       module: 'MOD-41', description: 'Acknowledge an SLA escalation' },
    { name: 'escalation.resolve',   module: 'MOD-41', description: 'Resolve an SLA escalation' },
    { name: 'handover.create',      module: 'MOD-44', description: 'Create an incident handover' },
    { name: 'handover.ack',         module: 'MOD-44', description: 'Acknowledge an incident handover' },
    { name: 'referral.coordinate',  module: 'MOD-38', description: 'Coordinate hospital receiving / referrals' },
    { name: 'resource.manage',      module: 'MOD-27', description: 'Manage resources and fleet' },
    { name: 'mutualaid.request',    module: 'MOD-35', description: 'Request mutual-aid resources' },
    { name: 'mutualaid.approve',    module: 'MOD-35', description: 'Approve or deny mutual-aid requests' },
    { name: 'medical.view',         module: 'MOD-48', description: 'View patient medical profile (audited)' },
    { name: 'announcement.publish', module: 'MOD-53', description: 'Publish municipal announcements' },
    { name: 'audit.view',           module: 'MOD-46', description: 'View the audit trail' },
    { name: 'admin.users.manage',   module: 'MOD-49', description: 'Manage user accounts' },
    { name: 'admin.permissions.manage', module: 'MOD-47', description: 'Grant / revoke role permissions' },
    { name: 'admin.config.manage',  module: 'MOD-49', description: 'Manage system configuration' },
  ];

  const permissionIdByName = new Map<string, string>();
  for (const p of PERMISSION_DEFS) {
    const row = await prisma.permissions.upsert({
      where: { name: p.name },
      update: { description: p.description, module_id: p.module },
      create: { name: p.name, description: p.description, module_id: p.module },
    });
    permissionIdByName.set(p.name, row.id);
  }

  const DISPATCHER_PERMS = [
    'incident.view', 'incident.acknowledge', 'incident.assess', 'incident.dispatch',
    'dispatch.create', 'dispatch.cancel', 'referral.coordinate',
    'handover.create', 'handover.ack', 'mutualaid.request', 'medical.view',
  ];
  const SUPERVISOR_PERMS = [
    ...DISPATCHER_PERMS, 'incident.resolve', 'incident.close',
    'escalation.ack', 'escalation.resolve', 'mutualaid.approve', 'audit.view',
  ];
  const ROLE_PERMS: Partial<Record<user_role, string[]>> = {
    [user_role.DISPATCHER]: DISPATCHER_PERMS,
    [user_role.SUPERVISOR]: SUPERVISOR_PERMS,
    [user_role.RESPONDER]: ['incident.view', 'handover.ack', 'medical.view'],
    [user_role.HOSPITAL_USER]: ['incident.view', 'referral.coordinate'],
    [user_role.ANNOUNCEMENTS_PUBLISHER]: ['announcement.publish'],
    [user_role.ORG_ADMINISTRATOR]: ['resource.manage', 'admin.users.manage', 'audit.view'],
    [user_role.SYSTEM_ADMINISTRATOR]: PERMISSION_DEFS.map((p) => p.name),
  };

  for (const [role, names] of Object.entries(ROLE_PERMS)) {
    for (const name of names ?? []) {
      const permission_id = permissionIdByName.get(name);
      if (!permission_id) continue;
      await prisma.role_permissions.upsert({
        where: { role_permission_id: { role: role as user_role, permission_id } },
        update: {},
        create: { role: role as user_role, permission_id },
      });
    }
  }

  console.log(`  Permissions done (${PERMISSION_DEFS.length} permissions mapped across roles — MOD-47)`);

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

  // ── Demo incidents across all categories ─────────────────────────────────────
  // One incident per remaining Bocaue category, spread across the lifecycle so the
  // dashboard, map, triage queue, and analytics are demo-able without manual entry.
  // Idempotent (fixed ids, empty update) so re-seeding never duplicates.

  const now = Date.now();
  const minsAgo = (m: number) => new Date(now - m * 60_000);

  interface DemoIncidentSpec {
    id: string;
    reference: string;
    category: incident_category;
    priority: incident_priority;
    status: incident_status;
    description: string;
    patients: number;
    reporter: { userId?: string; isGuest: boolean; name: string; phone: string };
    location: { lat: number; lng: number; address: string; barangay: string };
    stamps?: Record<string, Date>;
  }

  const demoIncidents: DemoIncidentSpec[] = [
    {
      id: '00000000-0000-0000-0005-000000000002',
      reference: 'INC-2026-DEMO02',
      category: incident_category.ROAD_ACCIDENT,
      priority: incident_priority.HIGH,
      status: incident_status.SUBMITTED,
      description: 'Demo: motorcycle vs tricycle along MacArthur Highway, two persons down.',
      patients: 2,
      reporter: { isGuest: true, name: 'Roadside Bystander', phone: '+639170000010' },
      location: { lat: 14.7260, lng: 120.9420, address: 'MacArthur Highway, Lolomboy, Bocaue, Bulacan', barangay: 'Lolomboy' },
      stamps: { submitted_at: minsAgo(4) },
    },
    {
      id: '00000000-0000-0000-0005-000000000003',
      reference: 'INC-2026-DEMO03',
      category: incident_category.FLOOD,
      priority: incident_priority.HIGH,
      status: incident_status.ACKNOWLEDGED,
      description: 'Demo: rising floodwater trapping a family on a rooftop near the river.',
      patients: 4,
      reporter: { userId: demoCitizen.id, isGuest: false, name: 'Demo Citizen', phone: '+639170000001' },
      location: { lat: 14.7319, lng: 120.9253, address: 'Riverside, Bunlo, Bocaue, Bulacan', barangay: 'Bunlo' },
      stamps: { submitted_at: minsAgo(18), received_at: minsAgo(16), acknowledged_at: minsAgo(14) },
    },
    {
      id: '00000000-0000-0000-0005-000000000004',
      reference: 'INC-2026-DEMO04',
      category: incident_category.RESCUE,
      priority: incident_priority.MEDIUM,
      status: incident_status.ON_SCENE,
      description: 'Demo: person stranded on collapsed footbridge, conscious.',
      patients: 1,
      reporter: { isGuest: true, name: 'Barangay Tanod', phone: '+639170000011' },
      location: { lat: 14.7097, lng: 120.9500, address: 'Creek crossing, Igulot, Bocaue, Bulacan', barangay: 'Igulot' },
      stamps: { submitted_at: minsAgo(40), received_at: minsAgo(38), acknowledged_at: minsAgo(36), assessed_at: minsAgo(34), dispatched_at: minsAgo(30), en_route_at: minsAgo(28), on_scene_at: minsAgo(15) },
    },
    {
      id: '00000000-0000-0000-0005-000000000005',
      reference: 'INC-2026-DEMO05',
      category: incident_category.FIRE,
      priority: incident_priority.CRITICAL,
      status: incident_status.DISPATCHED,
      description: 'Demo: structure fire at a fireworks storage facility, risk of secondary explosions.',
      patients: 0,
      reporter: { isGuest: true, name: 'Factory Guard', phone: '+639170000012' },
      location: { lat: 14.7950, lng: 120.9450, address: 'Fireworks compound, Bundukan, Bocaue, Bulacan', barangay: 'Bundukan' },
      stamps: { submitted_at: minsAgo(9), received_at: minsAgo(8), acknowledged_at: minsAgo(7), assessed_at: minsAgo(6), dispatched_at: minsAgo(4) },
    },
    {
      id: '00000000-0000-0000-0005-000000000006',
      reference: 'INC-2026-DEMO06',
      category: incident_category.INDUSTRIAL,
      priority: incident_priority.HIGH,
      status: incident_status.ASSESSED,
      description: 'Demo: chemical spill at a manufacturing plant, fumes reported.',
      patients: 3,
      reporter: { isGuest: true, name: 'Plant Supervisor', phone: '+639170000013' },
      location: { lat: 14.7650, lng: 120.9200, address: 'Industrial zone, Biñang 1st, Bocaue, Bulacan', barangay: 'Biñang 1st' },
      stamps: { submitted_at: minsAgo(22), received_at: minsAgo(20), acknowledged_at: minsAgo(18), assessed_at: minsAgo(12) },
    },
    {
      id: '00000000-0000-0000-0005-000000000007',
      reference: 'INC-2026-DEMO07',
      category: incident_category.DEBRIS,
      priority: incident_priority.LOW,
      status: incident_status.RESOLVED,
      description: 'Demo: fallen tree blocking a barangay road after a storm; cleared.',
      patients: 0,
      reporter: { isGuest: true, name: 'Resident', phone: '+639170000014' },
      location: { lat: 14.7847, lng: 120.9103, address: 'Barangay road, Bambang, Bocaue, Bulacan', barangay: 'Bambang' },
      stamps: { submitted_at: minsAgo(180), received_at: minsAgo(178), acknowledged_at: minsAgo(176), assessed_at: minsAgo(170), dispatched_at: minsAgo(160), en_route_at: minsAgo(155), on_scene_at: minsAgo(140), resolved_at: minsAgo(90) },
    },
    {
      id: '00000000-0000-0000-0005-000000000008',
      reference: 'INC-2026-DEMO08',
      category: incident_category.OTHER,
      priority: incident_priority.MEDIUM,
      status: incident_status.RECEIVED,
      description: 'Demo: missing elderly resident last seen near the public market.',
      patients: 1,
      reporter: { userId: bystander.id, isGuest: false, name: 'Demo Bystander', phone: '+639170000002' },
      location: { lat: 14.7969, lng: 120.9268, address: 'Public market, Poblacion, Bocaue, Bulacan', barangay: 'Poblacion' },
      stamps: { submitted_at: minsAgo(6), received_at: minsAgo(3) },
    },
  ];

  for (const spec of demoIncidents) {
    await prisma.incident.upsert({
      where: { id: spec.id },
      update: {},
      create: {
        id: spec.id,
        public_reference: spec.reference,
        category: spec.category,
        priority: spec.priority,
        status: spec.status,
        description: spec.description,
        number_of_patients: spec.patients,
        ...spec.stamps,
        incident_reporters: {
          create: {
            ...(spec.reporter.userId ? { user_id: spec.reporter.userId } : {}),
            is_guest: spec.reporter.isGuest,
            reporter_name: spec.reporter.name,
            reporter_phone: spec.reporter.phone,
          },
        },
        incident_locations: {
          create: {
            latitude: spec.location.lat,
            longitude: spec.location.lng,
            formatted_address: spec.location.address,
            barangay: spec.location.barangay,
            municipality: 'Bocaue',
            province: 'Bulacan',
          },
        },
      },
    });
  }

  console.log(`  Demo incidents done (${demoIncidents.length} across all categories)`);

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\nAGAP seed complete.');
  console.log('  Admin:', process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local');
  console.log('  Dev password (all other users):', DEV_PASSWORD);
  console.log('  Organizations: MDRRMO Bocaue, BFP Bocaue, Bocaue General Hospital');
  console.log('  Resources: 2 ambulances, 1 rescue boat, 1 fire truck, 1 rescue truck');
  console.log('  Capabilities: 13 (MOD-29) assigned to all 5 units');
  console.log('  Facilities: BGH + 4 evacuation centers (Lolomboy, Bambang, Bunlo, Igulot)');
  console.log('  Incidents: 8 demo incidents spanning every category + lifecycle stage');
  console.log('\n  One account per role (dev password above unless noted):');
  console.log('    SYSTEM_ADMINISTRATOR   : admin@agap.local (INITIAL_ADMIN_PASSWORD)');
  console.log('    DISPATCHER             : dispatcher1@mdrrmo.bocaue.gov.ph');
  console.log('    SUPERVISOR             : supervisor@mdrrmo.bocaue.gov.ph');
  console.log('    RESPONDER              : responder1@mdrrmo.bocaue.gov.ph');
  console.log('    HOSPITAL_USER          : receiving@bocauehospital.gov.ph');
  console.log('    ORG_ADMINISTRATOR      : orgadmin@mdrrmo.bocaue.gov.ph');
  console.log('    ANNOUNCEMENTS_PUBLISHER: announcements@lgu.bocaue.gov.ph');
  console.log('    CITIZEN                : citizen@demo.agap');
  console.log('    BYSTANDER              : bystander@demo.agap');
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
