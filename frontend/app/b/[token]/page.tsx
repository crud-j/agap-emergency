'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Eye, MapPin, Navigation, Phone, ShieldAlert, Siren, Truck } from 'lucide-react';
import { titleCase, timeAgo } from '@/lib/incident-format';

// Same-origin: next.config.mjs forwards just these public endpoints to the backend, so the page
// works behind any single public address (tunnel or domain) without CORS.
const API_BASE = '/v1/public/barangay';

type LinkStatus = 'SEEN' | 'ON_THE_WAY' | 'ON_SCENE' | 'HANDLED' | 'NEEDS_BACKUP';

interface LinkView {
  closed: boolean;
  barangayName: string;
  reference: string;
  category: string;
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    address: string | null;
    landmark: string | null;
    isApproximateBarangay: boolean;
  } | null;
  reportedAt: string;
  lastReport: string | null;
  lastReportAt: string | null;
  mdrrmoPhone: string | null;
}

/** The steps in the order they normally happen, then the exception. */
const ACTIONS: Array<{
  status: LinkStatus;
  label: string;
  hint: string;
  Icon: typeof Eye;
  /** Needs a second tap, so a slip of the thumb cannot close or escalate a live case. */
  confirm?: boolean;
  tone: 'step' | 'done' | 'alert';
}> = [
  { status: 'SEEN', label: 'We have seen it', hint: 'We received the alert', Icon: Eye, tone: 'step' },
  { status: 'ON_THE_WAY', label: 'We are acting on it', hint: 'Our team is responding', Icon: Truck, tone: 'step' },
  { status: 'ON_SCENE', label: 'We are on scene', hint: 'Our team has arrived', Icon: MapPin, tone: 'step' },
  { status: 'HANDLED', label: 'Completed', hint: 'The situation is handled', Icon: CheckCircle2, confirm: true, tone: 'done' },
  { status: 'NEEDS_BACKUP', label: 'We need backup', hint: 'Ask MDRRMO to send more help', Icon: ShieldAlert, confirm: true, tone: 'alert' },
];

const STATUS_LABEL: Record<string, string> = {
  SEEN: 'Seen',
  ON_THE_WAY: 'Acting on it',
  ON_SCENE: 'On scene',
  HANDLED: 'Completed',
  NEEDS_BACKUP: 'Needs backup',
  NO_ANSWER: 'No answer',
};

const TONE: Record<'step' | 'done' | 'alert', string> = {
  step: 'border-[rgba(168,181,193,0.35)] bg-white text-agap-textMain',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  alert: 'border-red-300 bg-red-50 text-red-700',
};

/** OpenStreetMap's embeddable view: a pin on a street map, no API key, works in any phone browser. */
function mapEmbed(lat: number, lng: number): string {
  const dLat = 0.0025;
  const dLng = 0.0035;
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

const mapsPin =(lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const mapsRoute = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/**
 * Public status page for one barangay alert, opened by typing the SMS access code on
 * `/b` (or by an older link token). No login: the code in the URL is the credential.
 * Shows the exact location and lets the barangay tell MDRRMO what is happening; the
 * dispatcher sees each tap live.
 */
export default function BarangayStatusPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<LinkView | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<LinkStatus | null>(null);
  const [armed, setArmed] = useState<LinkStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 404) { setInvalid(true); return; }
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as LinkView);
      setLoadError(false);
    } catch {
      // Keep whatever is on screen; mobile connectivity in the flood zones comes and goes.
      setLoadError(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function tap(status: LinkStatus, needsConfirm: boolean) {
    if (needsConfirm && armed !== status) { setArmed(status); return; }
    setArmed(null);
    setPending(status);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(token)}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.status === 410) { await load(); return; }
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as LinkView);
    } catch {
      setActionError('Could not send that. Check your signal and tap again.');
    } finally {
      setPending(null);
    }
  }

  if (invalid) {
    return (
      <Shell>
        <Card>
          <AlertTriangle className="mb-2 text-amber-600" />
          <h1 className="text-lg font-extrabold">This code is not valid</h1>
          <p className="mt-1 text-sm text-agap-textMid">
            Check it against the AGAP text (4 numbers and 4 letters, like 3470-KXPM), or call MDRRMO.
          </p>
          <a
            href="/b"
            className="mt-3 flex items-center justify-center rounded-xl bg-agap-green px-4 py-3 text-sm font-semibold text-white"
          >
            Enter the code again
          </a>
        </Card>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <Card>
          <p className="text-sm text-agap-textMid">{loadError ? 'Could not load. Retrying…' : 'Loading…'}</p>
        </Card>
      </Shell>
    );
  }

  const loc = view.location;

  return (
    <Shell>
      <Card>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          <Siren size={14} /> Emergency alert · Brgy {view.barangayName}
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-agap-textMain">{titleCase(view.category)}</h1>
        <p className="font-mono text-xs text-agap-textSub">
          {view.reference} · reported {timeAgo(view.reportedAt)}
        </p>
      </Card>

      {view.closed ? (
        <Card>
          <CheckCircle2 className="mb-2 text-emerald-600" />
          <h2 className="text-lg font-extrabold">This case is closed</h2>
          <p className="mt-1 text-sm text-agap-textMid">No further update is needed. Thank you for responding.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              <MapPin size={14} /> Exact location
            </div>
            {loc ? (
              <>
                {loc.address && <p className="text-base font-semibold text-agap-textMain">{loc.address}</p>}
                {loc.landmark && (
                  <p className="mt-0.5 text-sm text-agap-textMain">
                    <span className="font-semibold">Landmark:</span> {loc.landmark}
                  </p>
                )}
                <p className="mt-1 font-mono text-sm text-agap-textMain">
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  {loc.accuracyMeters != null && (
                    <span className="text-agap-textSub"> · within about {Math.max(1, Math.round(loc.accuracyMeters))} m</span>
                  )}
                </p>
                {loc.isApproximateBarangay && (
                  <p className="mt-1 text-xs text-amber-700">
                    This point is close to the edge of your barangay. Check the map before you go.
                  </p>
                )}
                <iframe
                  title={`Map of the incident, Brgy ${view.barangayName}`}
                  src={mapEmbed(loc.latitude, loc.longitude)}
                  className="mt-3 h-56 w-full rounded-xl border border-[rgba(168,181,193,0.35)]"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={mapsPin(loc.latitude, loc.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[rgba(168,181,193,0.35)] bg-white px-3 py-3 text-sm font-semibold text-agap-textMain"
                  >
                    <MapPin size={16} /> Open map
                  </a>
                  <a
                    href={mapsRoute(loc.latitude, loc.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-agap-green px-3 py-3 text-sm font-semibold text-white"
                  >
                    <Navigation size={16} /> Directions
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-agap-textMid">
                No GPS position was captured. Call MDRRMO for the location.
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              Tell MDRRMO what is happening
            </div>
            {view.lastReport && (
              <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                Sent to MDRRMO: <strong>{STATUS_LABEL[view.lastReport] ?? titleCase(view.lastReport)}</strong>
                {view.lastReportAt && <> · {timeAgo(view.lastReportAt)}</>}
              </p>
            )}
            <div className="space-y-2">
              {ACTIONS.map(({ status, label, hint, Icon, confirm, tone }) => {
                const current = view.lastReport === status;
                const isArmed = armed === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void tap(status, !!confirm)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left transition ${TONE[tone]} ${
                      current ? 'ring-2 ring-agap-green' : ''
                    } ${isArmed ? 'ring-2 ring-red-500' : ''} disabled:opacity-60`}
                  >
                    <Icon size={22} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold">
                        {pending === status ? 'Sending…' : isArmed ? `Tap again to confirm: ${label}` : label}
                      </span>
                      <span className="block text-xs opacity-80">{current ? 'Current status' : hint}</span>
                    </span>
                    {current && <CheckCircle2 size={18} className="shrink-0 text-agap-green" />}
                  </button>
                );
              })}
            </div>
            {actionError && <p className="mt-2 text-sm text-red-700" role="alert">{actionError}</p>}
            {loadError && !actionError && (
              <p className="mt-2 text-xs text-amber-700">Weak signal: the page will update when it reconnects.</p>
            )}
          </Card>
        </>
      )}

      {view.mdrrmoPhone && (
        <a
          href={`tel:${view.mdrrmoPhone}`}
          className="flex items-center justify-center gap-2 rounded-xl border border-[rgba(168,181,193,0.35)] bg-white px-4 py-3 text-sm font-semibold text-agap-textMain"
        >
          <Phone size={16} /> Call MDRRMO Operations {view.mdrrmoPhone}
        </a>
      )}
      <p className="pb-6 text-center text-[11px] text-agap-textSub">
        AGAP complements 911 and the MDRRMO hotline. It does not replace them.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-agap-pearl px-4 py-4">{children}</main>
  );
}

function Card({ children }: { children: React.ReactNode }): ReactElement {
  return <section className="rounded-2xl border border-[rgba(168,181,193,0.25)] bg-white p-4">{children}</section>;
}
