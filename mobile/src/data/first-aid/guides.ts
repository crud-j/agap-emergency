import { IncidentType } from '@agap/shared';
import type { FirstAidGuide } from './types';

/**
 * Bundled first-aid content for AGAP citizens/bystanders. Guidance follows
 * standard Philippine Red Cross / AHA / WHO basic first aid, framed as what a
 * bystander can safely do WHILE an ambulance or rescuer is already on the way.
 * AGAP complements — it never replaces 911/MDRRMO (Architectural Rule 9).
 *
 * All content is bilingual (EN/FIL) and shipped in-app so it works with zero
 * connectivity in Bocaue flood zones.
 */
export const GUIDES: FirstAidGuide[] = [
  // ── Core life-saving (shown under every category) ──────────────────────────
  {
    id: 'check-and-call',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 1,
    icon: 'alert-circle',
    urgency: 'critical',
    title: { en: 'Check & Call for Help', fil: 'Suriin at Tumawag ng Tulong' },
    summary: {
      en: 'The first 60 seconds — check the scene, check the person, get help coming.',
      fil: 'Ang unang 60 segundo — suriin ang lugar at ang tao, at humingi ng tulong.',
    },
    steps: [
      { text: { en: 'Check for danger — make sure the area is safe before you approach.', fil: 'Tingnan ang panganib — tiyaking ligtas ang lugar bago lumapit.' }, caution: true },
      { text: { en: 'Check if the person responds — tap the shoulders and ask loudly, “Are you okay?”', fil: 'Tingnan kung tumutugon — tapikin ang balikat at malakas na tanungin, “Ayos ka lang ba?”' } },
      { text: { en: 'Send for help — call 911 or the MDRRMO hotline, or ask a bystander to call. Keep AGAP open.', fil: 'Humingi ng tulong — tumawag sa 911 o MDRRMO hotline, o magpatawag sa katabi. Panatilihing bukas ang AGAP.' } },
      { text: { en: 'Check for normal breathing — watch the chest for up to 10 seconds.', fil: 'Tingnan ang normal na paghinga — bantayan ang dibdib hanggang 10 segundo.' } },
      { text: { en: 'If not breathing, be ready to start CPR (see the CPR guide).', fil: 'Kung hindi humihinga, maghandang magsimula ng CPR (tingnan ang gabay sa CPR).' } },
      { text: { en: 'Stay with the person and keep them calm until responders arrive.', fil: 'Manatili sa tao at panatagin hanggang dumating ang tutugon.' } },
    ],
    dos: [
      { en: 'Speak calmly and clearly.', fil: 'Magsalita nang mahinahon at malinaw.' },
      { en: 'Put your phone on speaker so you can act with both hands.', fil: 'Ilagay sa speaker ang telepono para magamit ang dalawang kamay.' },
      { en: 'Note the time the emergency started.', fil: 'Tandaan ang oras ng pagsisimula ng emergency.' },
    ],
    donts: [
      { en: 'Don’t put yourself in danger to reach someone.', fil: 'Huwag ilagay sa panganib ang sarili para abutin ang iba.' },
      { en: 'Don’t move a seriously injured person unless there is danger.', fil: 'Huwag igalaw ang malubhang nasaktan maliban kung may panganib.' },
      { en: 'Don’t leave the person alone if you can avoid it.', fil: 'Huwag iwanang mag-isa ang tao kung maiiwasan.' },
    ],
    whenToEscalate: [
      { en: 'The person is unconscious.', fil: 'Walang malay ang tao.' },
      { en: 'They are not breathing normally.', fil: 'Hindi normal ang paghinga.' },
      { en: 'There is heavy bleeding.', fil: 'May malakas na pagdugo.' },
    ],
  },
  {
    id: 'cpr-adult',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 2,
    icon: 'heart',
    urgency: 'critical',
    title: { en: 'CPR (Adult)', fil: 'CPR (Nasa Hustong Gulang)' },
    summary: {
      en: 'For an adult who is unconscious and not breathing normally.',
      fil: 'Para sa nasa hustong gulang na walang malay at hindi humihinga nang normal.',
    },
    steps: [
      { text: { en: 'Make sure help has already been called before you start.', fil: 'Tiyaking natawagan na ang tulong bago magsimula.' } },
      { text: { en: 'Lay the person flat on their back on a firm surface.', fil: 'Ihiga ang tao nang patihaya sa matigas na patag.' } },
      { text: { en: 'Place the heel of one hand in the center of the chest, the other hand on top.', fil: 'Ilagay ang palad ng isang kamay sa gitna ng dibdib, ang kabila sa ibabaw.' } },
      { text: { en: 'Push hard and fast — about 5 cm deep, 100–120 pushes per minute.', fil: 'Idiin nang malakas at mabilis — mga 5 cm ang lalim, 100–120 diin kada minuto.' }, caution: true },
      { text: { en: 'Let the chest rise fully between pushes.', fil: 'Hayaang bumalik nang buo ang dibdib sa bawat diin.' } },
      { text: { en: 'Keep going without stopping until responders take over or the person wakes.', fil: 'Ituloy nang walang tigil hanggang may pumalit o magising ang tao.' } },
      { text: { en: 'If trained, give 2 rescue breaths after every 30 pushes.', fil: 'Kung sanay, magbigay ng 2 rescue breath kada 30 diin.' } },
    ],
    dos: [
      { en: 'Push to the beat of a fast song.', fil: 'Isabay ang diin sa tempo ng mabilis na kanta.' },
      { en: 'Swap with another bystander every 2 minutes if tired.', fil: 'Magpalitan sa katabi kada 2 minuto kapag napagod.' },
      { en: 'Use an AED immediately if one is available.', fil: 'Gumamit agad ng AED kung mayroon.' },
    ],
    donts: [
      { en: 'Don’t stop to recheck unless the person clearly revives.', fil: 'Huwag huminto para mag-recheck maliban kung malinaw nang nagising.' },
      { en: 'Don’t be afraid to push firmly.', fil: 'Huwag matakot na idiin nang malakas.' },
      { en: 'Don’t delay — every second counts.', fil: 'Huwag mag-aksaya ng oras — mahalaga ang bawat segundo.' },
    ],
    whenToEscalate: [
      { en: 'This is already an emergency — keep CPR going until professional help arrives.', fil: 'Emergency na ito — ituloy ang CPR hanggang dumating ang propesyonal na tulong.' },
    ],
  },
  {
    id: 'severe-bleeding',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 3,
    icon: 'water',
    urgency: 'critical',
    title: { en: 'Severe Bleeding', fil: 'Malubhang Pagdugo' },
    summary: {
      en: 'To control heavy bleeding from a wound.',
      fil: 'Para kontrolin ang malakas na pagdugo mula sa sugat.',
    },
    steps: [
      { text: { en: 'Press firmly on the wound with a clean cloth or your hands.', fil: 'Idiin nang mariin ang sugat gamit ang malinis na tela o kamay.' } },
      { text: { en: 'Keep pressing without lifting to check — pressure must be constant.', fil: 'Panatilihing nakadiin nang hindi inaalis para tingnan — tuloy-tuloy ang diin.' }, caution: true },
      { text: { en: 'If blood soaks through, add more cloth on top; do not remove the first layer.', fil: 'Kung tumagos ang dugo, dagdagan ng tela sa ibabaw; huwag alisin ang unang patong.' } },
      { text: { en: 'Raise the injured part above heart level if you can.', fil: 'Itaas ang nasugatang bahagi nang mas mataas sa puso kung kaya.' } },
      { text: { en: 'If bleeding is life-threatening and won’t stop, apply a tight band above the wound as a last resort and note the time.', fil: 'Kung nakamamatay at hindi tumitigil, maglagay ng mahigpit na pamigkis sa itaas ng sugat bilang huling paraan at tandaan ang oras.' }, caution: true },
      { text: { en: 'Keep the person warm and still.', fil: 'Panatilihing mainit at hindi gumagalaw ang tao.' } },
    ],
    dos: [
      { en: 'Wear gloves or use a plastic bag if available.', fil: 'Magsuot ng guwantes o gumamit ng plastik kung mayroon.' },
      { en: 'Keep pressure until responders arrive.', fil: 'Panatilihin ang diin hanggang dumating ang tutugon.' },
      { en: 'Reassure the person.', fil: 'Panatagin ang tao.' },
    ],
    donts: [
      { en: 'Don’t remove soaked dressings.', fil: 'Huwag alisin ang basa nang telang pantakip.' },
      { en: 'Don’t peek at the wound repeatedly.', fil: 'Huwag paulit-ulit na sumilip sa sugat.' },
      { en: 'Don’t give food or drink.', fil: 'Huwag bigyan ng pagkain o inumin.' },
    ],
    whenToEscalate: [
      { en: 'Bleeding spurts or won’t stop.', fil: 'Bumubugso ang dugo o hindi tumitigil.' },
      { en: 'The person becomes pale, cold, or drowsy.', fil: 'Namumutla, nanlalamig, o inaantok ang tao.' },
    ],
  },
  {
    id: 'choking',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 4,
    icon: 'warning',
    urgency: 'critical',
    title: { en: 'Choking', fil: 'Pagkabulunan (Choking)' },
    summary: {
      en: 'For someone who cannot breathe, cough, or speak.',
      fil: 'Para sa taong hindi makahinga, makaubo, o makapagsalita.',
    },
    steps: [
      { text: { en: 'Ask “Are you choking?” If they can cough, encourage them to keep coughing.', fil: 'Itanong “Nabubulunan ka ba?” Kung nakakaubo, hikayating ituloy ang pag-ubo.' } },
      { text: { en: 'If they cannot breathe, stand behind and give 5 firm back blows between the shoulder blades.', fil: 'Kung hindi makahinga, tumayo sa likod at magbigay ng 5 malakas na tapik sa pagitan ng talim ng balikat.' } },
      { text: { en: 'If still blocked, give 5 abdominal thrusts (hands above the navel, pull in and up).', fil: 'Kung barado pa, magbigay ng 5 abdominal thrust (kamay sa itaas ng pusod, hilahin papasok at pataas).' }, caution: true },
      { text: { en: 'Repeat 5 back blows and 5 thrusts until the object comes out.', fil: 'Ulitin ang 5 tapik at 5 thrust hanggang lumabas ang bara.' } },
      { text: { en: 'If the person becomes unconscious, lower them gently and start CPR.', fil: 'Kung mawalan ng malay, dahan-dahang ihiga at magsimula ng CPR.' } },
    ],
    dos: [
      { en: 'Act quickly.', fil: 'Kumilos agad.' },
      { en: 'Call for help if the blockage doesn’t clear fast.', fil: 'Humingi ng tulong kung hindi agad naaalis ang bara.' },
      { en: 'Check the mouth and remove visible objects.', fil: 'Tingnan ang bibig at alisin ang nakikitang bara.' },
    ],
    donts: [
      { en: 'Don’t do a blind finger-sweep.', fil: 'Huwag maghalukay sa bibig nang hindi nakikita.' },
      { en: 'Don’t thrust a pregnant woman’s belly — press on the chest instead.', fil: 'Huwag i-thrust ang tiyan ng buntis — idiin sa dibdib sa halip.' },
      { en: 'Don’t slap the back while they can still cough upright.', fil: 'Huwag tapikin ang likod habang nakakaubo pa nang nakatayo.' },
    ],
    whenToEscalate: [
      { en: 'The person turns blue or goes limp.', fil: 'Nangingitim o nanlalata ang tao.' },
      { en: 'The object won’t dislodge.', fil: 'Hindi maalis ang bara.' },
    ],
  },
  {
    id: 'recovery-position',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 5,
    icon: 'bed',
    urgency: 'important',
    title: { en: 'Recovery Position', fil: 'Recovery Position (Paghiga sa Tagiliran)' },
    summary: {
      en: 'For an unconscious person who IS breathing normally.',
      fil: 'Para sa taong walang malay ngunit humihinga nang normal.',
    },
    steps: [
      { text: { en: 'Confirm they are breathing but not responding.', fil: 'Tiyaking humihinga ngunit hindi tumutugon.' } },
      { text: { en: 'Kneel beside them; place the near arm at a right angle.', fil: 'Lumuhod sa tabi; ilagay ang malapit na braso sa anggulong siko.' } },
      { text: { en: 'Bring the far hand to their cheek, bend the far knee, and roll them toward you onto their side.', fil: 'Idikit ang malayong kamay sa pisngi, baluktutin ang malayong tuhod, at igulong papunta sa iyo nang patagilid.' } },
      { text: { en: 'Tilt the head back slightly so the airway stays open.', fil: 'Bahagyang itungo pabalik ang ulo para manatiling bukas ang daanan ng hangin.' } },
      { text: { en: 'Check that they keep breathing until help arrives.', fil: 'Tiyaking patuloy na humihinga hanggang dumating ang tulong.' } },
    ],
    dos: [
      { en: 'Keep watching the breathing.', fil: 'Patuloy na bantayan ang paghinga.' },
      { en: 'Keep them warm.', fil: 'Panatilihing mainit ang tao.' },
      { en: 'Use this position if you must briefly leave to call.', fil: 'Gamitin ang posisyong ito kung kailangang sumandaling umalis para tumawag.' },
    ],
    donts: [
      { en: 'Don’t use this if you suspect a spinal injury unless they vomit or the airway is at risk.', fil: 'Huwag gamitin kung pinaghihinalaang may pinsala sa gulugod maliban kung nagsusuka o nanganganib ang paghinga.' },
      { en: 'Don’t leave them lying face-up unattended.', fil: 'Huwag iwang nakatihaya nang walang bantay.' },
      { en: 'Don’t give anything by mouth.', fil: 'Huwag magpainom o magpakain.' },
    ],
    whenToEscalate: [
      { en: 'Breathing stops or becomes irregular — start CPR.', fil: 'Huminto o naging iregular ang paghinga — magsimula ng CPR.' },
      { en: 'They cannot be woken.', fil: 'Hindi magising ang tao.' },
    ],
  },
  {
    id: 'shock',
    category: IncidentType.MEDICAL,
    appliesToAll: true,
    displayOrder: 6,
    icon: 'thermometer',
    urgency: 'important',
    title: { en: 'Shock', fil: 'Shock (Pagkawala ng Lakas)' },
    summary: {
      en: 'Signs: pale, cold, clammy skin, fast breathing, dizziness after injury.',
      fil: 'Palatandaan: maputla, malamig, pawisang balat, mabilis na paghinga, pagkahilo matapos masugatan.',
    },
    steps: [
      { text: { en: 'Help the person lie down.', fil: 'Tulungang mahiga ang tao.' } },
      { text: { en: 'Raise their legs about 30 cm if there is no leg or spine injury.', fil: 'Itaas ang mga binti nang mga 30 cm kung walang pinsala sa binti o gulugod.' } },
      { text: { en: 'Keep them warm with a blanket or jacket.', fil: 'Panatilihing mainit gamit ang kumot o jacket.' } },
      { text: { en: 'Loosen tight clothing and reassure them.', fil: 'Luwagan ang masikip na damit at panatagin sila.' } },
      { text: { en: 'Monitor breathing and response until help arrives.', fil: 'Bantayan ang paghinga at pagtugon hanggang dumating ang tulong.' } },
    ],
    dos: [
      { en: 'Keep them calm and still.', fil: 'Panatilihing kalmado at hindi gumagalaw.' },
      { en: 'Treat any obvious cause, such as bleeding.', fil: 'Lapatan ng lunas ang malinaw na sanhi, gaya ng pagdugo.' },
      { en: 'Stay with them.', fil: 'Manatili sa kanilang tabi.' },
    ],
    donts: [
      { en: 'Don’t give food, drink, or cigarettes.', fil: 'Huwag magbigay ng pagkain, inumin, o sigarilyo.' },
      { en: 'Don’t raise the legs if there is a fracture or spinal injury.', fil: 'Huwag itaas ang binti kung may bali o pinsala sa gulugod.' },
      { en: 'Don’t let them stand up.', fil: 'Huwag payagang tumayo.' },
    ],
    whenToEscalate: [
      { en: 'They lose consciousness.', fil: 'Nawalan sila ng malay.' },
      { en: 'Breathing becomes difficult.', fil: 'Nahihirapan na sa paghinga.' },
    ],
  },

  // ── Road / vehicle accident ────────────────────────────────────────────────
  {
    id: 'road-scene-safety',
    category: IncidentType.ROAD_ACCIDENT,
    displayOrder: 7,
    icon: 'car',
    urgency: 'important',
    title: { en: 'Make the Scene Safe', fil: 'Gawing Ligtas ang Lugar' },
    summary: {
      en: 'At a road crash, protect yourself and others before helping.',
      fil: 'Sa aksidente sa daan, protektahan ang sarili at iba bago tumulong.',
    },
    steps: [
      { text: { en: 'Park safely away from traffic and switch on hazard lights.', fil: 'Pumarada nang ligtas, malayo sa trapiko, at buksan ang hazard lights.' } },
      { text: { en: 'Watch for oncoming vehicles — do not step into traffic.', fil: 'Mag-ingat sa paparating na sasakyan — huwag humakbang sa daan.' }, caution: true },
      { text: { en: 'If safe, turn off the crashed vehicle’s engine.', fil: 'Kung ligtas, patayin ang makina ng naaksidenteng sasakyan.' } },
      { text: { en: 'Warn other drivers with an early-warning device, flashlight, or a person flagging.', fil: 'Bigyang-babala ang ibang drayber gamit ang early-warning device, flashlight, o taong sumesenyas.' } },
      { text: { en: 'Keep bystanders back and let no one smoke near fuel.', fil: 'Palayuin ang mga nanonood at huwag payagang manigarilyo malapit sa gasolina.' }, caution: true },
    ],
    dos: [
      { en: 'Wear something visible if you can.', fil: 'Magsuot ng kitang-kitang damit kung kaya.' },
      { en: 'Ask someone to direct traffic.', fil: 'Magpatulong na mag-direkta ng trapiko.' },
      { en: 'Call 911/MDRRMO with the exact location.', fil: 'Tumawag sa 911/MDRRMO kasama ang eksaktong lokasyon.' },
    ],
    donts: [
      { en: 'Don’t risk your life to reach the vehicle.', fil: 'Huwag ipanganib ang buhay para abutin ang sasakyan.' },
      { en: 'Don’t move casualties unless there is fire or danger.', fil: 'Huwag igalaw ang mga biktima maliban kung may sunog o panganib.' },
      { en: 'Don’t light anything near spilled fuel.', fil: 'Huwag magsindi ng anuman malapit sa tumapong gasolina.' },
    ],
    whenToEscalate: [
      { en: 'There is fire, smoke, or leaking fuel.', fil: 'May sunog, usok, o tumutulong gasolina.' },
      { en: 'Anyone is trapped or unconscious.', fil: 'May nakulong o walang malay.' },
    ],
  },
  {
    id: 'spinal-dont-move',
    category: IncidentType.ROAD_ACCIDENT,
    displayOrder: 8,
    icon: 'body',
    urgency: 'critical',
    title: { en: 'Do Not Move — Spinal Care', fil: 'Huwag Igalaw — Pangangalaga sa Gulugod' },
    summary: {
      en: 'After a crash or fall, assume a neck or back injury.',
      fil: 'Pagkatapos ng aksidente o pagkahulog, ituring na may pinsala sa leeg o likod.',
    },
    steps: [
      { text: { en: 'Tell the person to stay still and not turn their head.', fil: 'Sabihan ang tao na huwag gumalaw at huwag ilingon ang ulo.' } },
      { text: { en: 'Kneel behind their head and gently hold it steady in the position found.', fil: 'Lumuhod sa likod ng ulo at dahan-dahang hawakan itong nakatatag sa posisyong natagpuan.' }, caution: true },
      { text: { en: 'Keep holding until responders bring a neck brace or take over.', fil: 'Panatilihing hawak hanggang magdala ng neck brace o pumalit ang tutugon.' } },
      { text: { en: 'Only move them if there is fire, water, or they stop breathing.', fil: 'Igalaw lamang kung may sunog, tubig, o huminto sa paghinga.' }, caution: true },
      { text: { en: 'If you must move them, keep the head, neck, and body in one straight line.', fil: 'Kung kailangang igalaw, panatilihin sa isang linya ang ulo, leeg, at katawan.' } },
    ],
    dos: [
      { en: 'Keep them calm and still.', fil: 'Panatilihing kalmado at hindi gumagalaw.' },
      { en: 'Open the airway by lifting the jaw, not tilting the head.', fil: 'Buksan ang daanan ng hangin sa pag-angat ng panga, hindi sa pagtungo ng ulo.' },
      { en: 'Keep them warm.', fil: 'Panatilihing mainit ang tao.' },
    ],
    donts: [
      { en: 'Don’t let them sit up or walk “to check.”', fil: 'Huwag payagang umupo o maglakad “para tingnan.”' },
      { en: 'Don’t remove a motorcycle helmet unless you must open the airway.', fil: 'Huwag alisin ang helmet maliban kung kailangang buksan ang daanan ng hangin.' },
      { en: 'Don’t twist the neck or back.', fil: 'Huwag pilipitin ang leeg o likod.' },
    ],
    whenToEscalate: [
      { en: 'They stop breathing.', fil: 'Huminto sila sa paghinga.' },
      { en: 'A danger forces you to move them.', fil: 'May panganib na pumipilit na igalaw sila.' },
    ],
  },
  {
    id: 'trapped-conscious',
    category: IncidentType.ROAD_ACCIDENT,
    displayOrder: 9,
    icon: 'car-sport',
    urgency: 'important',
    title: { en: 'Helping a Trapped, Awake Person', fil: 'Pagtulong sa Nakulong ngunit Gising' },
    summary: {
      en: 'When someone is trapped but conscious and talking.',
      fil: 'Kapag may nakulong ngunit gising at nakakausap.',
    },
    steps: [
      { text: { en: 'Reassure them and tell them help is on the way.', fil: 'Panatagin sila at sabihing paparating na ang tulong.' } },
      { text: { en: 'Tell them to keep as still as possible.', fil: 'Sabihang manatiling hindi gumagalaw hangga’t maaari.' } },
      { text: { en: 'Control any heavy bleeding you can safely reach with firm pressure.', fil: 'Kontrolin ang malakas na pagdugo na ligtas mong maaabot sa pamamagitan ng mariing diin.' } },
      { text: { en: 'Keep them warm and keep talking to them.', fil: 'Panatilihing mainit at patuloy na kausapin.' } },
      { text: { en: 'Do not attempt to pull them free unless there is immediate danger.', fil: 'Huwag subukang hilahin palabas maliban kung may agarang panganib.' }, caution: true },
    ],
    dos: [
      { en: 'Note what is trapping them to tell responders.', fil: 'Tandaan kung ano ang pumipigil sa kanila para sabihin sa tutugon.' },
      { en: 'Keep their airway clear.', fil: 'Panatilihing malinaw ang daanan ng hangin.' },
      { en: 'Stay within sight.', fil: 'Manatiling nakikita nila.' },
    ],
    donts: [
      { en: 'Don’t give food or drink.', fil: 'Huwag bigyan ng pagkain o inumin.' },
      { en: 'Don’t let them fall asleep without monitoring.', fil: 'Huwag payagang makatulog nang walang pagbabantay.' },
      { en: 'Don’t force the rescue yourself.', fil: 'Huwag pilitin ang pagliligtas nang mag-isa.' },
    ],
    whenToEscalate: [
      { en: 'They lose consciousness.', fil: 'Nawalan sila ng malay.' },
      { en: 'Bleeding is severe.', fil: 'Malubha ang pagdugo.' },
      { en: 'A new hazard appears (fire, rising water).', fil: 'May bagong panganib (sunog, tumataas na tubig).' },
    ],
  },

  // ── Fire & burns ─────────────────────────────────────────────────────────
  {
    id: 'burns',
    category: IncidentType.FIRE,
    displayOrder: 10,
    icon: 'flame',
    urgency: 'critical',
    title: { en: 'Burns', fil: 'Paso (Burns)' },
    summary: {
      en: 'For heat, fire, or scald burns.',
      fil: 'Para sa paso mula sa init, apoy, o kumukulong likido.',
    },
    steps: [
      { text: { en: 'Move the person away from the heat source.', fil: 'Ilayo ang tao sa pinagmumulan ng init.' } },
      { text: { en: 'Cool the burn under cool running water for at least 20 minutes.', fil: 'Palamigin ang paso sa umaagos na malamig na tubig nang hindi bababa sa 20 minuto.' }, caution: true },
      { text: { en: 'Remove rings, watches, and loose clothing near the burn before it swells — but not anything stuck to the skin.', fil: 'Alisin ang singsing, relos, at maluwag na damit malapit sa paso bago mamaga — ngunit hindi ang nakadikit sa balat.' }, caution: true },
      { text: { en: 'Cover loosely with a clean non-fluffy cloth or cling film.', fil: 'Takpan nang maluwag ng malinis na telang hindi mabuhok o cling film.' } },
      { text: { en: 'Keep the person warm overall, since cooling a large burn can chill them.', fil: 'Panatilihing mainit ang katawan, dahil ang paglamig ng malaking paso ay maaaring giniin sila.' } },
    ],
    dos: [
      { en: 'Use clean water.', fil: 'Gumamit ng malinis na tubig.' },
      { en: 'Keep cooling even on the way to help.', fil: 'Ipagpatuloy ang paglamig kahit papunta sa tulong.' },
      { en: 'Reassure the person.', fil: 'Panatagin ang tao.' },
    ],
    donts: [
      { en: 'Don’t use ice, toothpaste, oil, or ointments.', fil: 'Huwag gumamit ng yelo, toothpaste, mantika, o pamahid.' },
      { en: 'Don’t pop blisters.', fil: 'Huwag pisilin ang paltos.' },
      { en: 'Don’t remove clothing stuck to the burn.', fil: 'Huwag alisin ang damit na nakadikit sa paso.' },
    ],
    whenToEscalate: [
      { en: 'The burn is large, deep, or on the face, hands, or genitals.', fil: 'Malaki, malalim, o nasa mukha, kamay, o ari ang paso.' },
      { en: 'The person has trouble breathing (possible airway burn).', fil: 'Nahihirapan sa paghinga (posibleng napaso ang daanan ng hangin).' },
    ],
  },
  {
    id: 'smoke-inhalation',
    category: IncidentType.FIRE,
    displayOrder: 11,
    icon: 'cloud',
    urgency: 'important',
    title: { en: 'Smoke Inhalation', fil: 'Nalanghap na Usok' },
    summary: {
      en: 'After breathing in smoke or fumes.',
      fil: 'Pagkatapos makalanghap ng usok o singaw.',
    },
    steps: [
      { text: { en: 'Get the person to fresh air immediately — only if it is safe for you.', fil: 'Dalhin agad ang tao sa sariwang hangin — kung ligtas lamang para sa iyo.' }, caution: true },
      { text: { en: 'Help them sit upright to breathe more easily.', fil: 'Tulungang umupong tuwid para mas madaling huminga.' } },
      { text: { en: 'Loosen tight clothing around the neck and chest.', fil: 'Luwagan ang masikip na damit sa leeg at dibdib.' } },
      { text: { en: 'Encourage slow, steady breathing and keep them calm.', fil: 'Hikayatin ang mabagal at pantay na paghinga at panatagin sila.' } },
      { text: { en: 'Watch for coughing, hoarseness, or trouble breathing.', fil: 'Bantayan ang pag-ubo, pamamalat, o hirap sa paghinga.' } },
    ],
    dos: [
      { en: 'Keep them still and resting.', fil: 'Panatilihing nakapahinga at hindi gumagalaw.' },
      { en: 'Call for help if breathing is affected.', fil: 'Humingi ng tulong kung apektado ang paghinga.' },
      { en: 'Stay with them.', fil: 'Manatili sa kanilang tabi.' },
    ],
    donts: [
      { en: 'Don’t go back into smoke to retrieve belongings.', fil: 'Huwag bumalik sa usok para kunin ang gamit.' },
      { en: 'Don’t let them exert themselves.', fil: 'Huwag payagang magpagod.' },
      { en: 'Don’t ignore a hoarse voice or cough.', fil: 'Huwag balewalain ang paos na boses o ubo.' },
    ],
    whenToEscalate: [
      { en: 'They struggle to breathe, wheeze, or have soot around the mouth or nose.', fil: 'Nahihirapang huminga, humahagok, o may uling sa paligid ng bibig o ilong.' },
      { en: 'They become drowsy or confused.', fil: 'Inaantok o nalilito sila.' },
    ],
  },
  {
    id: 'electrical-injury',
    category: IncidentType.FIRE,
    displayOrder: 12,
    icon: 'flash',
    urgency: 'critical',
    title: { en: 'Electrical Injury', fil: 'Pinsala mula sa Kuryente' },
    summary: {
      en: 'When someone is shocked by electricity.',
      fil: 'Kapag may na-kuryente.',
    },
    steps: [
      { text: { en: 'Do not touch the person while they are still in contact with the current.', fil: 'Huwag hawakan ang tao habang nakadikit pa sa kuryente.' }, caution: true },
      { text: { en: 'Switch off the power at the main source if you can.', fil: 'Patayin ang kuryente sa pangunahing switch kung kaya.' } },
      { text: { en: 'If you cannot cut the power, stand on something dry and push them away with a dry wooden or plastic object.', fil: 'Kung hindi mapatay ang kuryente, tumayo sa tuyong bagay at itulak sila palayo gamit ang tuyong kahoy o plastik.' }, caution: true },
      { text: { en: 'Once safe, check breathing and start CPR if they are not breathing.', fil: 'Kapag ligtas na, tingnan ang paghinga at magsimula ng CPR kung hindi humihinga.' } },
      { text: { en: 'Treat burns at the points where the current entered and left the body.', fil: 'Lapatan ng lunas ang paso sa pinasukan at nilabasan ng kuryente sa katawan.' } },
    ],
    dos: [
      { en: 'Make sure the area is dry.', fil: 'Tiyaking tuyo ang lugar.' },
      { en: 'Call for help immediately.', fil: 'Humingi agad ng tulong.' },
      { en: 'Keep them still in case of a fall injury.', fil: 'Panatilihing hindi gumagalaw sakaling may pinsala mula sa pagkahulog.' },
    ],
    donts: [
      { en: 'Don’t touch them bare-handed while live.', fil: 'Huwag hawakan nang walang proteksyon habang may kuryente.' },
      { en: 'Don’t use anything metal or wet to separate them.', fil: 'Huwag gumamit ng bakal o basang bagay para ihiwalay sila.' },
      { en: 'Don’t move them more than necessary.', fil: 'Huwag igalaw nang higit sa kailangan.' },
    ],
    whenToEscalate: [
      { en: 'They are not breathing.', fil: 'Hindi sila humihinga.' },
      { en: 'There are burns or they fell from a height.', fil: 'May paso o nahulog sila mula sa taas.' },
    ],
  },
  {
    id: 'clothing-on-fire',
    category: IncidentType.FIRE,
    displayOrder: 13,
    icon: 'bonfire',
    urgency: 'important',
    title: { en: 'Clothing on Fire', fil: 'Nasusunog na Damit' },
    summary: {
      en: 'If a person’s clothes catch fire.',
      fil: 'Kung nagliyab ang damit ng tao.',
    },
    steps: [
      { text: { en: 'Stop the person from running — movement feeds the flames.', fil: 'Pigilan ang tao sa pagtakbo — pinalalaki ng galaw ang apoy.' }, caution: true },
      { text: { en: 'Drop them to the ground.', fil: 'Patihayain sila sa lupa.' } },
      { text: { en: 'Cover their face and smother the flames with a blanket or thick cloth.', fil: 'Takpan ang mukha at patayin ang apoy gamit ang kumot o makapal na tela.' } },
      { text: { en: 'Roll them along the ground until the flames are out.', fil: 'Igulong sila sa lupa hanggang mamatay ang apoy.' } },
      { text: { en: 'Then cool the burns with water and treat as a burn.', fil: 'Pagkatapos, palamigin ang paso ng tubig at lapatan gaya ng paso.' } },
    ],
    dos: [
      { en: 'Use a non-synthetic blanket if possible.', fil: 'Gumamit ng hindi sintetikong kumot kung maaari.' },
      { en: 'Protect your own hands.', fil: 'Protektahan ang sariling kamay.' },
      { en: 'Call for help.', fil: 'Humingi ng tulong.' },
    ],
    donts: [
      { en: 'Don’t let them stay standing or run.', fil: 'Huwag payagang manatiling nakatayo o tumakbo.' },
      { en: 'Don’t use synthetic fabrics that can melt.', fil: 'Huwag gumamit ng sintetikong telang natutunaw.' },
      { en: 'Don’t remove clothing stuck to burns.', fil: 'Huwag alisin ang damit na nakadikit sa paso.' },
    ],
    whenToEscalate: [
      { en: 'The burns are large or deep.', fil: 'Malaki o malalim ang paso.' },
      { en: 'They have trouble breathing.', fil: 'Nahihirapan sila sa paghinga.' },
    ],
  },

  // ── Flood & water ────────────────────────────────────────────────────────
  {
    id: 'near-drowning',
    category: IncidentType.FLOOD,
    displayOrder: 14,
    icon: 'boat',
    urgency: 'critical',
    title: { en: 'Near-Drowning', fil: 'Halos Malunod' },
    summary: {
      en: 'Helping someone pulled from floodwater or a river.',
      fil: 'Pagtulong sa taong iniahon mula sa baha o ilog.',
    },
    steps: [
      { text: { en: 'Reach, throw, don’t go — use a pole, rope, or float; enter the water only as a last resort.', fil: 'Abutin, ihagis, huwag sumugod — gumamit ng patpat, lubid, o salbabida; pumasok sa tubig bilang huling paraan lamang.' }, caution: true },
      { text: { en: 'Once out, check if they respond and are breathing.', fil: 'Kapag naiahon na, tingnan kung tumutugon at humihinga.' } },
      { text: { en: 'If not breathing, start CPR right away.', fil: 'Kung hindi humihinga, magsimula agad ng CPR.' }, caution: true },
      { text: { en: 'If breathing, place them in the recovery position and keep the airway clear.', fil: 'Kung humihinga, ilagay sa recovery position at panatilihing malinaw ang daanan ng hangin.' } },
      { text: { en: 'Remove wet clothing and keep them warm.', fil: 'Alisin ang basang damit at panatilihing mainit sila.' } },
    ],
    dos: [
      { en: 'Keep your own safety first.', fil: 'Unahin ang sariling kaligtasan.' },
      { en: 'Call for help immediately.', fil: 'Humingi agad ng tulong.' },
      { en: 'Expect them to cough up water.', fil: 'Asahang maiuubo nila ang tubig.' },
    ],
    donts: [
      { en: 'Don’t dive into fast or murky floodwater to reach them.', fil: 'Huwag sumisid sa mabilis o maputik na baha para abutin sila.' },
      { en: 'Don’t try to “push out” swallowed water.', fil: 'Huwag subukang “ilabas” ang nalunok na tubig.' },
      { en: 'Don’t leave them alone.', fil: 'Huwag iwanang mag-isa.' },
    ],
    whenToEscalate: [
      { en: 'They are not breathing or are unconscious.', fil: 'Hindi humihinga o walang malay.' },
      { en: 'They were underwater for a long time.', fil: 'Matagal silang nasa ilalim ng tubig.' },
    ],
  },
  {
    id: 'hypothermia',
    category: IncidentType.FLOOD,
    displayOrder: 15,
    icon: 'snow',
    urgency: 'important',
    title: { en: 'Hypothermia (Cold Exposure)', fil: 'Hypothermia (Sobrang Lamig)' },
    summary: {
      en: 'After long exposure to rain, flood, or cold.',
      fil: 'Pagkatapos ng matagal na pagkabasa sa ulan, baha, o lamig.',
    },
    steps: [
      { text: { en: 'Move the person to a dry, sheltered place.', fil: 'Dalhin ang tao sa tuyo at may silong na lugar.' } },
      { text: { en: 'Remove wet clothing and wrap them in dry blankets, covering the head.', fil: 'Alisin ang basang damit at balutin ng tuyong kumot, pati ang ulo.' } },
      { text: { en: 'Warm the body core gradually — chest, neck, and groin.', fil: 'Dahan-dahang painitin ang gitna ng katawan — dibdib, leeg, at singit.' } },
      { text: { en: 'If fully alert, give warm (not hot) sweet drinks.', fil: 'Kung ganap na alerto, bigyan ng mainit (hindi napakainit) na matamis na inumin.' } },
      { text: { en: 'Handle them gently and keep them lying still.', fil: 'Alagaang maingat at panatilihing nakahigang hindi gumagalaw.' }, caution: true },
    ],
    dos: [
      { en: 'Share body heat if nothing else is available.', fil: 'Magbahagi ng init ng katawan kung wala nang iba.' },
      { en: 'Keep them off the cold ground.', fil: 'Huwag ipahiga sa malamig na lupa.' },
      { en: 'Monitor breathing.', fil: 'Bantayan ang paghinga.' },
    ],
    donts: [
      { en: 'Don’t rub the arms and legs vigorously.', fil: 'Huwag himasin nang marahas ang braso at binti.' },
      { en: 'Don’t give alcohol.', fil: 'Huwag magbigay ng alak.' },
      { en: 'Don’t use direct high heat that can burn numb skin.', fil: 'Huwag gumamit ng tuwirang matinding init na nakakapaso sa manhid na balat.' },
    ],
    whenToEscalate: [
      { en: 'They become confused, very drowsy, or stop shivering while still cold.', fil: 'Nalilito, labis na inaantok, o tumigil sa pangangatog habang malamig pa.' },
      { en: 'Breathing slows.', fil: 'Bumabagal ang paghinga.' },
    ],
  },
  {
    id: 'flood-wounds',
    category: IncidentType.FLOOD,
    displayOrder: 16,
    icon: 'medkit',
    urgency: 'info',
    title: { en: 'Wounds After a Flood', fil: 'Mga Sugat Pagkatapos ng Baha' },
    summary: {
      en: 'Floodwater is dirty — even small wounds can get infected.',
      fil: 'Marumi ang tubig-baha — kahit maliit na sugat ay maaaring mahawa.',
    },
    steps: [
      { text: { en: 'Wash your hands or use a clean barrier before touching the wound.', fil: 'Maghugas ng kamay o gumamit ng malinis na proteksyon bago hawakan ang sugat.' } },
      { text: { en: 'Rinse the wound with clean or boiled-then-cooled water.', fil: 'Banlawan ang sugat ng malinis o pinakuluan-pagkatapos-pinalamig na tubig.' } },
      { text: { en: 'Gently remove dirt and debris you can see.', fil: 'Dahan-dahang alisin ang nakikitang dumi at tinik.' } },
      { text: { en: 'Cover with a clean, dry dressing.', fil: 'Takpan ng malinis at tuyong pantapal.' } },
      { text: { en: 'Watch for redness, swelling, pus, or fever over the next days.', fil: 'Bantayan ang pamumula, pamamaga, nana, o lagnat sa mga susunod na araw.' } },
    ],
    dos: [
      { en: 'Keep the wound dry and clean.', fil: 'Panatilihing tuyo at malinis ang sugat.' },
      { en: 'Change the dressing if it gets wet or dirty.', fil: 'Palitan ang pantapal kung mabasa o marumi.' },
      { en: 'Ask a health worker about a tetanus shot.', fil: 'Magtanong sa health worker tungkol sa tetanus shot.' },
    ],
    donts: [
      { en: 'Don’t wash wounds with floodwater.', fil: 'Huwag hugasan ang sugat ng tubig-baha.' },
      { en: 'Don’t ignore growing redness or pain.', fil: 'Huwag balewalain ang lumalalang pamumula o sakit.' },
      { en: 'Don’t seal a very dirty wound tightly.', fil: 'Huwag takpan nang mahigpit ang napakaruming sugat.' },
    ],
    whenToEscalate: [
      { en: 'The wound is deep, gaping, or caused by something rusty.', fil: 'Malalim, nakabuka, o dulot ng kinakalawang na bagay ang sugat.' },
      { en: 'Signs of infection or fever appear.', fil: 'May palatandaan ng impeksyon o lagnat.' },
    ],
  },
];
