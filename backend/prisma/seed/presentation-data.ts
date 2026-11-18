/**
 * Presentation data: realistic Bocaue incidents, dispatches and announcements for the
 * product video and live demos.
 *
 * - The current shift: 8 incidents across every category and lifecycle stage (fixed ids
 *   kept from the old demo set), with the dispatches a real shift would have.
 * - The last 30 days: ~56 closed, resolved and cancelled incidents with completed
 *   dispatches, so Analytics, the Risk Map, Incident History and the citizen History
 *   screen have something to show. Includes a typhoon week of floods in the flood-prone
 *   barangays, many reported by SMS.
 * - Announcements: a flood warning, an evacuation order (archived), a post-typhoon
 *   update, a fireworks-season advisory, a health service notice, and one CRITICAL
 *   advisory waiting for the Supervisor's approval.
 *
 * Realism rules:
 * - Every pin is a random point inside the barangay's real boundary (geo_regions), so
 *   maps and per-barangay counts agree.
 * - References run INC-<year>-000001… in time order with no gaps. The backend numbers a
 *   new report as "count of this year's references + 1", so the first live SOS after
 *   seeding gets the next free number and never collides.
 * - Names and phone numbers are made up (+63917000xxxx is a test range). No real person.
 * - Deterministic (fixed PRNG seed): seeding twice gives the same data.
 *
 * Run on an empty database (`pnpm db:reset-data` first). If a reference it would use is
 * already taken by another incident, the incidents are skipped with a warning.
 */
import {
  PrismaClient,
  announcement_category,
  announcement_language,
  announcement_scope,
  announcement_severity,
  announcement_status,
  dispatch_status,
  incident_category,
  incident_priority,
  incident_status,
  report_channel,
  resource_status,
} from '@prisma/client';

export interface PresentationContext {
  dispatchers: string[];
  supervisorId: string;
  publisherId: string;
  mdrrmoOrgId: string;
  bfpOrgId: string;
  /** Registered citizens whose History screen should show past reports. */
  citizens: Array<{ id: string; name: string; phone: string }>;
  bystander: { id: string; name: string; phone: string };
  crew: { alpha1: string; charlie1: string };
}

// ─── Units (fixed ids from the main seed) ─────────────────────────────────────

const UNIT = {
  ALPHA1: '00000000-0000-0000-0003-000000000001',
  ALPHA2: '00000000-0000-0000-0003-000000000002',
  BRAVO1: '00000000-0000-0000-0003-000000000003',
  CHARLIE1: '00000000-0000-0000-0003-000000000004',
  CHARLIE2: '00000000-0000-0000-0003-000000000005',
  ALPHA3: '00000000-0000-0000-0003-000000000006',
  CHARLIE3: '00000000-0000-0000-0003-000000000007',
} as const;

const BFP_UNITS = new Set<string>([UNIT.CHARLIE1, UNIT.CHARLIE2, UNIT.CHARLIE3]);

const UNITS_FOR: Record<incident_category, string[]> = {
  MEDICAL: [UNIT.ALPHA1, UNIT.ALPHA2, UNIT.ALPHA3],
  ROAD_ACCIDENT: [UNIT.ALPHA1, UNIT.ALPHA2, UNIT.ALPHA3],
  FLOOD: [UNIT.BRAVO1, UNIT.CHARLIE2],
  RESCUE: [UNIT.CHARLIE2, UNIT.BRAVO1],
  FIRE: [UNIT.CHARLIE1, UNIT.CHARLIE3],
  INDUSTRIAL: [UNIT.CHARLIE1, UNIT.CHARLIE3],
  DEBRIS: [UNIT.CHARLIE2],
  OTHER: [UNIT.ALPHA2, UNIT.ALPHA3],
  NATURAL_DISASTER: [UNIT.CHARLIE2, UNIT.BRAVO1],
};

// ─── Places ───────────────────────────────────────────────────────────────────

const ALL_BARANGAYS = [
  'Antipona', 'Bagumbayan', 'Bambang', 'Batia', 'Biñang 1st', 'Biñang 2nd', 'Bolacan', 'Bundukan',
  'Bunlo', 'Caingin', 'Duhat', 'Igulot', 'Lolomboy', 'Poblacion', 'Sulucan', 'Taal', 'Tambubong',
  'Turo', 'Wakas',
];
const FLOOD_PRONE = ['Lolomboy', 'Bunlo', 'Igulot', 'Bambang'];
const INDUSTRIAL = ['Bundukan', 'Biñang 1st'];
// Busier barangays get more medical and road calls.
const BUSY = ['Poblacion', 'Wakas', 'Turo', 'Lolomboy', 'Biñang 2nd', 'Bunlo', 'Taal'];

const STREETS = [
  'Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Rizal St.', 'Mabini St.', 'Bonifacio St.',
  'Del Pilar St.', 'Sampaguita St.', 'Gumamela St.', 'Luna St.',
];
const LANDMARKS = [
  'malapit sa barangay hall', 'tapat ng elementary school', 'tabi ng kapilya', 'sa may covered court',
  'tapat ng sari-sari store', 'malapit sa basketball court', 'sa likod ng health center', 'kanto ng main road',
];

// ─── People (made up) ─────────────────────────────────────────────────────────

const FIRST = [
  'Maricel', 'Jerome', 'Rowena', 'Ramil', 'Liza', 'Arnel', 'Joy', 'Danilo', 'Kristine', 'Rodel',
  'Analyn', 'Elmer', 'Cherry', 'Romeo', 'Divina', 'Marlon', 'Shiela', 'Noel', 'Jenalyn', 'Ricardo',
  'Lorna', 'Bernard', 'Glenda', 'Reynaldo', 'Mylene', 'Edwin',
];
const LAST = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Villanueva', 'Dizon', 'Manalo', 'Pascual', 'Mercado',
  'Aquino', 'Navarro', 'Gonzales', 'de Guzman', 'Soriano', 'Salazar', 'Valdez', 'Castillo', 'Espiritu',
];

// ─── What callers say (Taglish, the way reports really come in) ───────────────

const TEXT: Record<incident_category, Array<{ d: string; p: number }>> = {
  MEDICAL: [
    { d: 'Si Lolo (74) biglang nahirapang huminga at sumasakit ang dibdib. Gising pa pero pawis na pawis.', p: 1 },
    { d: 'Nahulog si Lola sa hagdan, hindi makatayo, may sugat sa ulo at nahihilo.', p: 1 },
    { d: 'Buntis, 38 weeks, pumutok na ang panubigan at malakas na ang contractions.', p: 1 },
    { d: 'Batang 6 years old, mataas ang lagnat at nagkukumbulsyon.', p: 1 },
    { d: 'Tatay namin bigla na lang natumba, hindi makapagsalita nang maayos, nangangalay ang kanang braso.', p: 1 },
    { d: 'Diabetic, nanghihina at nanginginig, mababa daw ang sugar.', p: 1 },
    { d: 'Nasaksak sa braso habang nag-aawayan, malakas ang dugo pero gising.', p: 1 },
    { d: 'Matandang babae, hirap huminga, may hika, hindi tumatalab ang inhaler.', p: 1 },
  ],
  ROAD_ACCIDENT: [
    { d: 'Banggaan ng motor at tricycle. Dalawa ang sugatan, isa hindi makatayo.', p: 2 },
    { d: 'Nasagasaan ng jeep ang tumatawid na estudyante. Gising pero dumudugo ang binti.', p: 1 },
    { d: 'Motorsiklo sumemplang sa basang kalsada, rider walang helmet, may sugat sa ulo.', p: 1 },
    { d: 'Truck at kotse nagbanggaan, may naipit sa loob ng kotse.', p: 2 },
    { d: 'Self-accident ng motor, angkas na bata umiiyak at masakit ang braso.', p: 2 },
    { d: 'Tricycle tumaob, tatlong pasahero may galos, isa nahihilo.', p: 3 },
  ],
  FLOOD: [
    { d: 'Tubig hanggang dibdib na sa loob ng bahay. Apat kami kasama ang dalawang bata, nasa second floor na.', p: 4 },
    { d: 'Pamilya na may matanda at bedridden, hindi makalabas, mabilis tumataas ang tubig.', p: 3 },
    { d: 'May mga nakatira sa bubong, hindi na madaanan ng sasakyan ang kalye.', p: 5 },
    { d: 'Ilog umapaw, may batang tinangay ng agos pero nakakapit sa poste.', p: 1 },
    { d: 'Baha sa buong purok, kailangan ng bangka para sa mga senior.', p: 6 },
  ],
  RESCUE: [
    { d: 'May taong naipit sa gumuhong footbridge sa sapa, gising pero hindi makaalis.', p: 1 },
    { d: 'Nahulog sa kanal ang lalaki, malalim ang tubig, hindi makaahon.', p: 1 },
    { d: 'Construction worker nahulog sa scaffolding, nakabitin sa harness.', p: 1 },
  ],
  FIRE: [
    { d: 'Nasusunog ang bahay, makapal ang usok, may matanda pa raw sa loob.', p: 1 },
    { d: 'Sunog sa bodega ng paputok, may naririnig na maliliit na pagsabog.', p: 0 },
    { d: 'Nag-apoy ang poste ng kuryente at kumakalat sa kalapit na tindahan.', p: 0 },
    { d: 'Grassfire malapit sa mga bahay, malakas ang hangin.', p: 0 },
  ],
  INDUSTRIAL: [
    { d: 'Malakas na amoy ng kemikal mula sa planta, tatlong trabahador nahihilo at nagsusuka.', p: 3 },
    { d: 'Pagsabog sa pagawaan ng paputok, may sugatan, may usok pa.', p: 2 },
  ],
  DEBRIS: [
    { d: 'Natumbang puno ng acacia, harang sa buong daan pagkatapos ng malakas na hangin.', p: 0 },
    { d: 'Bumagsak na kable ng kuryente sa kalsada, may spark pa.', p: 0 },
    { d: 'Gumuho ang pader sa gilid ng kalye, may debris sa daan.', p: 0 },
  ],
  OTHER: [
    { d: 'Nawawala si Lola (81), may dementia, huling nakita sa palengke.', p: 1 },
    { d: 'Batang naligaw sa plaza, hinahanap ang magulang.', p: 1 },
  ],
  NATURAL_DISASTER: [
    { d: 'Malakas na hangin, natanggal ang bubong ng ilang bahay sa purok.', p: 0 },
  ],
};

// ─── Deterministic randomness ─────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
function weighted<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    if ((r -= w) <= 0) return v;
  }
  return entries[entries.length - 1]![0];
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

interface Stamps {
  submitted_at: Date;
  received_at?: Date;
  acknowledged_at?: Date;
  assessed_at?: Date;
  dispatched_at?: Date;
  en_route_at?: Date;
  on_scene_at?: Date;
  resolved_at?: Date;
  closed_at?: Date;
}

interface PlannedIncident {
  id: string;
  category: incident_category;
  priority: incident_priority;
  status: incident_status;
  channel: report_channel;
  description: string | null;
  patients: number;
  reporter: { userId?: string; isGuest: boolean; name: string; phone: string; status?: 'SAFE' | 'NEEDS_HELP' };
  barangay: string;
  street: string;
  landmark: string;
  stamps: Stamps;
  dispatch?: {
    id: string;
    unit: string;
    status: dispatch_status;
    crewUserId?: string;
    notes?: string;
  };
}

const addSec = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

/** Realistic lifecycle times from a submit time. Floods and fires take longer on scene. */
function lifecycle(submitted: Date, category: incident_category): Required<Stamps> {
  const slow = category === 'FLOOD' || category === 'FIRE' || category === 'INDUSTRIAL' || category === 'RESCUE';
  const received = addSec(submitted, between(4, 25));
  const ack = addSec(submitted, between(35, 170));
  const assessed = addSec(ack, between(40, 150));
  const dispatched = addSec(assessed, between(45, 260));
  const enRoute = addSec(dispatched, between(30, 120));
  const onScene = addSec(enRoute, between(slow ? 600 : 360, slow ? 1800 : 1080));
  const resolved = addSec(onScene, between(slow ? 2400 : 1500, slow ? 7200 : 4200));
  const closed = addSec(resolved, between(480, 2400));
  return {
    submitted_at: submitted, received_at: received, acknowledged_at: ack, assessed_at: assessed,
    dispatched_at: dispatched, en_route_at: enRoute, on_scene_at: onScene, resolved_at: resolved, closed_at: closed,
  };
}

/** A random name from the pool, and a phone number in the +63917000xxxx test range. */
let phoneSerial = 100;
function guest() {
  return { isGuest: true, name: `${pick(FIRST)} ${pick(LAST)}`, phone: `+63917000${String(phoneSerial++).padStart(4, '0')}` };
}

function planHistory(ctx: PresentationContext, now: number): PlannedIncident[] {
  const out: PlannedIncident[] = [];
  const day = 86_400_000;
  // Typhoon week: 12 to 10 days ago.
  const typhoonFrom = now - 12 * day;
  const typhoonTo = now - 10 * day;
  const hourWeights: Array<[number, number]> = [
    [0, 1], [2, 1], [5, 2], [7, 4], [8, 4], [10, 3], [12, 3], [14, 3], [16, 4], [17, 5], [18, 5],
    [19, 5], [20, 4], [21, 3], [22, 2], [23, 2],
  ];
  const citizenTurns = [...ctx.citizens, ...ctx.citizens];

  const make = (i: number, submitted: Date, category: incident_category, inTyphoon: boolean) => {
    const barangay =
      category === 'FLOOD' ? pick(FLOOD_PRONE)
      : category === 'INDUSTRIAL' ? pick(INDUSTRIAL)
      : category === 'FIRE' && rand() < 0.35 ? pick(INDUSTRIAL)
      : rand() < 0.6 ? pick(BUSY) : pick(ALL_BARANGAYS);
    const text = pick(TEXT[category]);
    const channel = rand() < (inTyphoon ? 0.45 : 0.08) ? report_channel.SMS : report_channel.APP;
    const outcome = weighted<incident_status>([
      [incident_status.CLOSED, 84], [incident_status.FALSE_ALERT, 5], [incident_status.CANCELLED, 4],
      [incident_status.DUPLICATE, 4], [incident_status.RESOLVED, 3],
    ]);
    const full = lifecycle(submitted, category);
    let stamps: Stamps;
    if (outcome === incident_status.CLOSED) stamps = full;
    else if (outcome === incident_status.RESOLVED) {
      // Resolved, waiting for the dispatcher to close it: no closed_at.
      const { closed_at: _notClosed, ...open } = full;
      stamps = open;
    } else {
      // Cancelled, false alert or duplicate: caught at the desk, before any unit moved.
      stamps = { submitted_at: full.submitted_at, received_at: full.received_at, acknowledged_at: full.acknowledged_at };
    }
    const priority =
      category === 'FIRE' || category === 'INDUSTRIAL' ? pick([incident_priority.CRITICAL, incident_priority.HIGH])
      : category === 'FLOOD' ? pick([incident_priority.HIGH, incident_priority.HIGH, incident_priority.CRITICAL])
      : category === 'DEBRIS' || category === 'OTHER' ? pick([incident_priority.LOW, incident_priority.MEDIUM])
      : pick([incident_priority.HIGH, incident_priority.MEDIUM, incident_priority.MEDIUM, incident_priority.CRITICAL]);
    // A few past reports belong to the seeded citizens, for their History screen.
    const citizen = outcome === incident_status.CLOSED && channel === 'APP' && rand() < 0.12 ? citizenTurns.shift() : undefined;
    const reporter = citizen
      ? { userId: citizen.id, isGuest: false, name: citizen.name, phone: citizen.phone }
      : guest();
    const moved = !!stamps.dispatched_at;
    const unit = pick(UNITS_FOR[category]);
    out.push({
      id: `00000000-0000-0000-0005-${String(100 + i).padStart(12, '0')}`,
      category,
      priority,
      status: outcome,
      channel,
      // An SMS report carries only the category and position, never free text.
      description: channel === 'SMS' ? null : text.d,
      patients: text.p,
      reporter: { ...reporter, status: text.p > 0 && rand() < 0.4 ? 'NEEDS_HELP' : 'SAFE' },
      barangay,
      street: pick(STREETS),
      landmark: pick(LANDMARKS),
      stamps,
      ...(moved && {
        dispatch: {
          id: `00000000-0000-0000-0006-${String(100 + i).padStart(12, '0')}`,
          unit,
          status: dispatch_status.COMPLETED,
        },
      }),
    });
  };

  let i = 0;
  // Ordinary days: 1 to 30 days ago, outside the typhoon week.
  for (let d = 30; d >= 1; d--) {
    const dayStart = now - d * day;
    if (dayStart >= typhoonFrom - day && dayStart < typhoonTo) continue;
    const count = weighted<number>([[0, 2], [1, 5], [2, 4], [3, 1]]);
    for (let k = 0; k < count; k++) {
      const hour = weighted(hourWeights);
      const submitted = new Date(dayStart - (dayStart % day) + (hour - 8) * 3_600_000 + between(0, 3_500_000));
      const category = weighted<incident_category>([
        [incident_category.MEDICAL, 44], [incident_category.ROAD_ACCIDENT, 28], [incident_category.FIRE, 8],
        [incident_category.INDUSTRIAL, 4], [incident_category.RESCUE, 4], [incident_category.DEBRIS, 4],
        [incident_category.OTHER, 4], [incident_category.FLOOD, 4],
      ]);
      make(i++, submitted, category, false);
    }
  }
  // Typhoon week: floods, rescues and fallen trees, many by SMS.
  for (let k = 0; k < 16; k++) {
    const submitted = new Date(typhoonFrom + rand() * (typhoonTo - typhoonFrom));
    const category = weighted<incident_category>([
      [incident_category.FLOOD, 9], [incident_category.RESCUE, 3], [incident_category.DEBRIS, 3], [incident_category.MEDICAL, 1],
    ]);
    make(i++, submitted, category, true);
  }
  return out;
}

function planCurrentShift(ctx: PresentationContext, now: number): PlannedIncident[] {
  const ago = (m: number) => new Date(now - m * 60_000);
  const [first] = ctx.citizens;
  return [
    {
      // Kept id: the ready-made dispatch for responder1 (ALPHA-1), offer waiting.
      id: '00000000-0000-0000-0005-000000000001',
      category: incident_category.MEDICAL, priority: incident_priority.HIGH, status: incident_status.DISPATCHED,
      channel: report_channel.APP,
      description: 'Si Lolo (74) biglang nahirapang huminga at sumasakit ang dibdib. Gising pa pero pawis na pawis.',
      patients: 1,
      reporter: { userId: first!.id, isGuest: false, name: first!.name, phone: first!.phone, status: 'SAFE' },
      barangay: 'Turo', street: 'Mabini St.', landmark: 'tapat ng elementary school',
      stamps: { submitted_at: ago(9), received_at: ago(9), acknowledged_at: ago(8), assessed_at: ago(7), dispatched_at: ago(5) },
      dispatch: {
        id: '00000000-0000-0000-0006-000000000001', unit: UNIT.ALPHA1, status: dispatch_status.SENT,
        crewUserId: ctx.crew.alpha1, notes: 'Possible cardiac. Patient conscious, diaphoretic.',
      },
    },
    {
      id: '00000000-0000-0000-0005-000000000002',
      category: incident_category.ROAD_ACCIDENT, priority: incident_priority.HIGH, status: incident_status.SUBMITTED,
      channel: report_channel.APP,
      description: 'Banggaan ng motor at tricycle sa tapat ng gasolinahan. Dalawa ang sugatan, isa hindi makatayo.',
      patients: 2,
      reporter: { isGuest: true, name: 'Jerome Villanueva', phone: '+639170000020', status: 'SAFE' },
      barangay: 'Wakas', street: 'Rizal St.', landmark: 'kanto ng main road',
      stamps: { submitted_at: ago(3) },
    },
    {
      id: '00000000-0000-0000-0005-000000000003',
      category: incident_category.FLOOD, priority: incident_priority.HIGH, status: incident_status.ACKNOWLEDGED,
      channel: report_channel.APP,
      description: 'Tubig hanggang dibdib na sa loob ng bahay. Apat kami kasama ang dalawang bata, nasa second floor na.',
      patients: 4,
      reporter: { isGuest: true, name: 'Rowena Pascual', phone: '+639170000021', status: 'NEEDS_HELP' },
      barangay: 'Bunlo', street: 'Purok 4', landmark: 'malapit sa basketball court',
      stamps: { submitted_at: ago(17), received_at: ago(17), acknowledged_at: ago(15) },
    },
    {
      id: '00000000-0000-0000-0005-000000000004',
      category: incident_category.RESCUE, priority: incident_priority.MEDIUM, status: incident_status.ON_SCENE,
      channel: report_channel.APP,
      description: 'May taong naipit sa gumuhong footbridge sa sapa, gising pero hindi makaalis.',
      patients: 1,
      reporter: { isGuest: true, name: 'Kgd. Ramil Santos', phone: '+639170000022', status: 'SAFE' },
      barangay: 'Igulot', street: 'Purok 2', landmark: 'tabi ng kapilya',
      stamps: { submitted_at: ago(41), received_at: ago(41), acknowledged_at: ago(39), assessed_at: ago(37), dispatched_at: ago(34), en_route_at: ago(33), on_scene_at: ago(18) },
      dispatch: { id: '00000000-0000-0000-0006-000000000004', unit: UNIT.CHARLIE2, status: dispatch_status.ACCEPTED },
    },
    {
      id: '00000000-0000-0000-0005-000000000005',
      category: incident_category.FIRE, priority: incident_priority.CRITICAL, status: incident_status.DISPATCHED,
      channel: report_channel.APP,
      description: 'Nasusunog ang bodega ng paputok! May naririnig kaming maliliit na pagsabog. Wala raw tao sa loob sabi ng guard.',
      patients: 0,
      reporter: { isGuest: true, name: 'Edgardo Manalo', phone: '+639170000023', status: 'SAFE' },
      barangay: 'Bundukan', street: 'Del Pilar St.', landmark: 'sa likod ng health center',
      stamps: { submitted_at: ago(8), received_at: ago(8), acknowledged_at: ago(7), assessed_at: ago(6), dispatched_at: ago(4) },
      dispatch: {
        id: '00000000-0000-0000-0006-000000000005', unit: UNIT.CHARLIE1, status: dispatch_status.SENT,
        crewUserId: ctx.crew.charlie1, notes: 'Fireworks storage. Secondary explosions reported. Stage upwind.',
      },
    },
    {
      id: '00000000-0000-0000-0005-000000000006',
      category: incident_category.INDUSTRIAL, priority: incident_priority.HIGH, status: incident_status.ASSESSED,
      channel: report_channel.APP,
      description: 'Malakas na amoy ng kemikal mula sa planta, tatlong trabahador nahihilo at nagsusuka.',
      patients: 3,
      reporter: { isGuest: true, name: 'Engr. Glenda Soriano', phone: '+639170000024', status: 'SAFE' },
      barangay: 'Biñang 1st', street: 'Purok 5', landmark: 'kanto ng main road',
      stamps: { submitted_at: ago(22), received_at: ago(22), acknowledged_at: ago(20), assessed_at: ago(13) },
    },
    {
      id: '00000000-0000-0000-0005-000000000007',
      category: incident_category.DEBRIS, priority: incident_priority.LOW, status: incident_status.RESOLVED,
      channel: report_channel.APP,
      description: 'Natumbang puno ng acacia, harang sa buong daan pagkatapos ng malakas na hangin.',
      patients: 0,
      reporter: { isGuest: true, name: 'Lorna Espiritu', phone: '+639170000025', status: 'SAFE' },
      barangay: 'Bambang', street: 'Sampaguita St.', landmark: 'sa may covered court',
      stamps: { submitted_at: ago(185), received_at: ago(185), acknowledged_at: ago(183), assessed_at: ago(180), dispatched_at: ago(176), en_route_at: ago(175), on_scene_at: ago(158), resolved_at: ago(92) },
      dispatch: { id: '00000000-0000-0000-0006-000000000007', unit: UNIT.CHARLIE2, status: dispatch_status.COMPLETED },
    },
    {
      id: '00000000-0000-0000-0005-000000000008',
      category: incident_category.OTHER, priority: incident_priority.MEDIUM, status: incident_status.RECEIVED,
      channel: report_channel.APP,
      description: 'Nawawala si Lola Remedios (81), may dementia, huling nakita sa palengke suot ang asul na daster.',
      patients: 1,
      reporter: { userId: ctx.bystander.id, isGuest: false, name: ctx.bystander.name, phone: ctx.bystander.phone, status: 'SAFE' },
      barangay: 'Poblacion', street: 'Luna St.', landmark: 'tapat ng sari-sari store',
      stamps: { submitted_at: ago(6), received_at: ago(5) },
    },
  ];
}

// ─── Points inside the real barangay boundaries ───────────────────────────────

async function pointsByBarangay(
  prisma: PrismaClient,
  need: Map<string, number>,
): Promise<Map<string, Array<{ lat: number; lng: number }>>> {
  const out = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const [name, count] of need) {
    let rows: Array<{ lat: number; lng: number }> = [];
    try {
      // Fixed seed (PostGIS 3+): the same pins every time.
      rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT ST_Y(p.geom)::float8 AS lat, ST_X(p.geom)::float8 AS lng
          FROM geo_regions r,
               LATERAL ST_Dump(ST_GeneratePoints(r.boundary, ${count}::int, 20261115)) p
         WHERE r.region_type = 'barangay' AND r.name = ${name}`;
    } catch {
      rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT ST_Y(p.geom)::float8 AS lat, ST_X(p.geom)::float8 AS lng
          FROM geo_regions r,
               LATERAL ST_Dump(ST_GeneratePoints(r.boundary, ${count}::int)) p
         WHERE r.region_type = 'barangay' AND r.name = ${name}`;
    }
    if (rows.length === 0) {
      // No boundary for this name: centre of Bocaue, so the incident still shows up.
      rows = Array.from({ length: count }, () => ({ lat: 14.7985 + between(-0.004, 0.004), lng: 120.926 + between(-0.004, 0.004) }));
      console.log(`  ! No geo_regions boundary for "${name}": used points near the town centre`);
    }
    out.set(name, rows);
  }
  return out;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function seedPresentationData(prisma: PrismaClient, ctx: PresentationContext): Promise<void> {
  const now = Date.now();
  const year = new Date(now).getFullYear();
  const prefix = `INC-${year}-`;

  const planned = [...planHistory(ctx, now), ...planCurrentShift(ctx, now)]
    .filter((p) => p.stamps.submitted_at.getFullYear() === year)
    .sort((a, b) => a.stamps.submitted_at.getTime() - b.stamps.submitted_at.getTime());
  const withRef = planned.map((p, i) => ({ ...p, reference: `${prefix}${String(i + 1).padStart(6, '0')}` }));

  // A reference taken by some other incident means the database is not empty: skip.
  const clash = await prisma.incident.findFirst({
    where: {
      public_reference: { in: withRef.map((p) => p.reference) },
      id: { notIn: withRef.map((p) => p.id) },
    },
    select: { public_reference: true },
  });
  if (clash) {
    console.log(`  ! Skipped presentation incidents: ${clash.public_reference} is already used by another incident.`);
    console.log('    Empty the database first: pnpm db:reset-data && pnpm db:seed');
  } else {
    const need = new Map<string, number>();
    for (const p of withRef) need.set(p.barangay, (need.get(p.barangay) ?? 0) + 1);
    const points = await pointsByBarangay(prisma, need);
    let dispatcherTurn = 0;

    for (const p of withRef) {
      const pt = points.get(p.barangay)!.shift()!;
      const s = p.stamps;
      await prisma.incident.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          public_reference: p.reference,
          category: p.category,
          priority: p.priority,
          status: p.status,
          report_channel: p.channel,
          description: p.description,
          number_of_patients: p.patients,
          ...s,
          created_at: s.submitted_at,
          updated_at: s.closed_at ?? s.resolved_at ?? s.on_scene_at ?? s.dispatched_at ?? s.acknowledged_at ?? s.submitted_at,
          incident_reporters: {
            create: {
              ...(p.reporter.userId ? { user_id: p.reporter.userId } : {}),
              is_guest: p.reporter.isGuest,
              reporter_name: p.reporter.name,
              reporter_phone: p.reporter.phone,
              ...(p.channel === 'SMS' ? { contact_callback: p.reporter.phone } : {}),
              ...(p.reporter.status ? { reporter_status: p.reporter.status } : {}),
              created_at: s.submitted_at,
            },
          },
          incident_locations: {
            create: {
              latitude: Number(pt.lat.toFixed(7)),
              longitude: Number(pt.lng.toFixed(7)),
              accuracy_meters: Number(between(p.channel === 'SMS' ? 15 : 4, p.channel === 'SMS' ? 60 : 22).toFixed(2)),
              formatted_address: `${p.street}, ${p.barangay}, Bocaue, Bulacan`,
              landmark: p.landmark,
              barangay: p.barangay,
              municipality: 'Bocaue',
              province: 'Bulacan',
              captured_at: s.submitted_at,
            },
          },
        },
      });

      if (p.dispatch) {
        const d = p.dispatch;
        const completed = d.status === dispatch_status.COMPLETED;
        const accepted = completed || d.status === dispatch_status.ACCEPTED;
        await prisma.dispatches.upsert({
          where: { id: d.id },
          update: {},
          create: {
            id: d.id,
            incident_id: p.id,
            resource_id: d.unit,
            dispatcher_id: ctx.dispatchers[dispatcherTurn++ % ctx.dispatchers.length]!,
            organization_id: BFP_UNITS.has(d.unit) ? ctx.bfpOrgId : ctx.mdrrmoOrgId,
            status: d.status,
            authorized_at: s.dispatched_at!,
            sent_at: s.dispatched_at!,
            ...(accepted && { accepted_at: addSec(s.dispatched_at!, between(20, 75)) }),
            ...(accepted && s.en_route_at && { en_route_at: s.en_route_at }),
            ...(accepted && s.on_scene_at && { on_scene_at: s.on_scene_at }),
            ...(completed && s.resolved_at && { field_done_at: s.resolved_at, completed_at: s.resolved_at }),
            created_at: s.dispatched_at!,
            ...(d.notes ? { dispatch_notes: d.notes } : {}),
            ...(d.crewUserId ? { dispatch_crew: { create: { user_id: d.crewUserId, role_on_scene: 'Lead Responder' } } } : {}),
          },
        });
        // A unit on a live call is not free for the next one.
        if (!completed) {
          await prisma.resources.update({
            where: { id: d.unit },
            data: {
              status: d.status === dispatch_status.ACCEPTED ? resource_status.ON_SCENE : resource_status.DISPATCHED,
              current_incident_id: p.id,
            },
          });
        }
      }
    }

    const history = withRef.length - 8;
    const sms = withRef.filter((p) => p.channel === 'SMS').length;
    console.log(`  Presentation incidents done: ${withRef.length} (${history} from the last 30 days, 8 on the current shift, ${sms} reported by SMS)`);
    console.log(`  References ${withRef[0]!.reference} to ${withRef[withRef.length - 1]!.reference}; the next live report gets ${prefix}${String(withRef.length + 1).padStart(6, '0')}`);
  }

  await seedAnnouncements(prisma, ctx, now);
}

async function seedAnnouncements(prisma: PrismaClient, ctx: PresentationContext, now: number) {
  const daysAgo = (d: number) => new Date(now - d * 86_400_000);
  const minsAgo = (m: number) => new Date(now - m * 60_000);
  const office = 'Bocaue MDRRMO';
  // Plain rows (foreign keys as ids, the unchecked create shape).
  const items: Array<{ id: string } & Record<string, unknown>> = [
    {
      id: '00000000-0000-0000-0007-000000000001',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'Bocaue River nearing critical level: maghanda sa posibleng paglikas',
      summary: 'Umabot na sa 11.2 m ang Bocaue River. Critical level: 11.50 m.',
      body: 'Patuloy ang pagtaas ng tubig sa Bocaue River dahil sa malakas na ulan. Umabot na ito sa 11.2 metro; ang critical level ay 11.50 metro. Ang mga residente ng Lolomboy, Bunlo, Igulot at Bambang ay pinapayuhang ihanda ang go-bag, ilikas ang mga senior, PWD at buntis sa mas mataas na lugar, at hintayin ang abiso ng barangay.',
      action_required: 'Ihanda ang go-bag. Ilikas nang maaga ang senior, PWD at buntis.',
      category: announcement_category.FLOOD_ALERT, severity: announcement_severity.WARNING,
      scope: announcement_scope.BARANGAY_SPECIFIC, target_barangays: [...FLOOD_PRONE],
      status: announcement_status.ARCHIVED, language: announcement_language.FIL_EN,
      issuing_office: office, source_reference: 'MDRRMO river gauge, Bocaue Bridge',
      published_at: daysAgo(12), effective_start_at: daysAgo(12), archived_at: daysAgo(9),
      push_sent_count: 2140, sms_sent_count: 486, created_at: daysAgo(12),
    },
    {
      id: '00000000-0000-0000-0007-000000000002',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'MANDATORY EVACUATION: Bocaue River at 11.6 m',
      summary: 'Lumampas na sa critical level ang ilog. Lumikas na ngayon.',
      body: 'Lumampas na sa 11.50 m critical level ang Bocaue River. Ipinatutupad ang mandatory evacuation sa Lolomboy, Bunlo, Igulot at Bambang. Bukas ang mga evacuation center sa bawat barangay. Patayin ang main switch ng kuryente bago umalis. Para sa tulong sa paglikas, gamitin ang AGAP SOS o tumawag sa MDRRMO.',
      action_required: 'Lumikas na ngayon papunta sa pinakamalapit na evacuation center.',
      category: announcement_category.EVACUATION_ORDER, severity: announcement_severity.CRITICAL,
      scope: announcement_scope.BARANGAY_SPECIFIC, target_barangays: [...FLOOD_PRONE],
      status: announcement_status.ARCHIVED, language: announcement_language.FIL_EN,
      issuing_office: office, source_reference: 'MDRRMO river gauge, Bocaue Bridge',
      approval_requested_at: daysAgo(11.02), approval_requested_by_id: ctx.publisherId,
      approved_at: daysAgo(11), approved_by_id: ctx.supervisorId,
      published_at: daysAgo(11), effective_start_at: daysAgo(11), archived_at: daysAgo(9),
      push_sent_count: 2312, sms_sent_count: 501, created_at: daysAgo(11.03),
    },
    {
      id: '00000000-0000-0000-0007-000000000003',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'Post-typhoon update: madadaanan na ang lahat ng kalsada',
      summary: 'Tapos na ang clearing operations. Bumalik na sa normal ang biyahe.',
      body: 'Natapos na ng MDRRMO at BFP ang clearing ng mga natumbang puno at debris. Madadaanan na ang lahat ng pangunahing kalsada sa Bocaue. Bukas pa rin ang relief desk sa munisipyo para sa mga apektadong pamilya.',
      category: announcement_category.POST_DISASTER_UPDATE, severity: announcement_severity.INFORMATIONAL,
      scope: announcement_scope.MUNICIPALITY_WIDE, status: announcement_status.PUBLISHED,
      language: announcement_language.FIL_EN, issuing_office: office,
      published_at: daysAgo(8), effective_start_at: daysAgo(8),
      push_sent_count: 3876, sms_sent_count: 0, created_at: daysAgo(8),
    },
    {
      id: '00000000-0000-0000-0007-000000000004',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'Fireworks season safety: ligtas na pagbili at pag-iimbak ng paputok',
      summary: 'Bumili lamang sa lisensyadong tindahan. Huwag mag-imbak sa loob ng bahay.',
      body: 'Habang papalapit ang Bagong Taon, pinaaalalahanan ang lahat na bumili lamang ng paputok sa mga lisensyadong tindahan sa Bocaue. Huwag mag-imbak ng paputok malapit sa kalan o sa loob ng bahay. Ang mga pagawaan sa Bundukan at Biñang 1st ay ininspeksyon ng BFP. I-report agad sa AGAP ang anumang sunog o pagsabog.',
      action_required: 'Bumili lamang sa lisensyadong tindahan. I-report agad ang sunog.',
      category: announcement_category.FIRE_ADVISORY, severity: announcement_severity.ADVISORY,
      scope: announcement_scope.MUNICIPALITY_WIDE, status: announcement_status.PUBLISHED,
      language: announcement_language.FIL_EN, issuing_office: 'Bocaue MDRRMO with BFP Bocaue',
      published_at: daysAgo(3), effective_start_at: daysAgo(3),
      push_sent_count: 3911, sms_sent_count: 0, created_at: daysAgo(3),
    },
    {
      id: '00000000-0000-0000-0007-000000000005',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'Libreng Basic Life Support training sa Poblacion Covered Court',
      summary: 'Sabado, 8:00 AM. Bukas sa lahat ng residente, may certificate.',
      body: 'Inaanyayahan ang lahat ng residente sa libreng Basic Life Support at First Aid training ng MDRRMO. Ituturo ang CPR, pagpigil ng pagdurugo at tamang pag-report ng emergency gamit ang AGAP. Magdala ng valid ID.',
      category: announcement_category.MUNICIPAL_SERVICE, severity: announcement_severity.INFORMATIONAL,
      scope: announcement_scope.MUNICIPALITY_WIDE, status: announcement_status.PUBLISHED,
      language: announcement_language.FIL_EN, issuing_office: office,
      published_at: daysAgo(1), effective_start_at: daysAgo(1),
      push_sent_count: 3925, sms_sent_count: 0, created_at: daysAgo(1),
    },
    {
      // Waits on the Supervisor's Approvals page (backup for the approval shot).
      id: '00000000-0000-0000-0007-000000000006',
      publisher_id: ctx.publisherId, organization_id: ctx.mdrrmoOrgId,
      title: 'Tropical Storm Signal No. 1 itinaas sa Bulacan',
      summary: 'Asahan ang malakas na ulan at hangin sa susunod na 36 oras.',
      body: 'Itinaas ang Tropical Cyclone Wind Signal No. 1 sa Bulacan. Asahan ang malakas na ulan at hangin sa susunod na 36 oras. Ang mga residente ng mababang lugar ay pinapayuhang ihanda ang go-bag at bantayan ang abiso ng barangay at ng AGAP.',
      action_required: 'Ihanda ang go-bag. Bantayan ang abiso ng barangay.',
      category: announcement_category.WEATHER_ADVISORY, severity: announcement_severity.CRITICAL,
      scope: announcement_scope.MUNICIPALITY_WIDE, status: announcement_status.PENDING_APPROVAL,
      language: announcement_language.FIL_EN, issuing_office: office, source_reference: 'PAGASA Tropical Cyclone Bulletin',
      approval_requested_at: minsAgo(24), approval_requested_by_id: ctx.publisherId,
      created_at: minsAgo(31),
    },
  ];

  for (const { id, ...data } of items) {
    await prisma.announcement.upsert({ where: { id }, update: {}, create: { id, ...data } as never });
  }
  console.log(`  Announcements done (${items.length}: 3 published, 2 archived, 1 awaiting Supervisor approval)`);
}
