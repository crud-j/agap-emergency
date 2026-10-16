'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Check, CircleAlert, CloudRain, Construction, DoorOpen, Droplets,
  ImagePlus, Megaphone, PencilLine, RotateCcw, School, Send, Waves, X,
  type LucideIcon,
} from 'lucide-react';
import {
  Button, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { AnnouncementPreview, type PreviewModel } from '@/components/announcements/AnnouncementPreview';
import {
  useAnnouncement,
  useAnnouncementImage,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementImage,
  usePublishAnnouncement,
} from '@/features/announcements/hooks';
import type { CreateAnnouncementBody } from '@/features/announcements/api';
import {
  TEMPLATES, getTemplate, visibleFields, generate, readiness, areaText, cap,
  BOCAUE_BARANGAYS, FLOOD_PRONE_BARANGAYS, ISSUERS, SAFETY_ACTIONS,
  manilaInputToIso,
  type AnnouncementTemplate, type CommonInput, type IssuerKey, type LanguageMode,
  type Severity, type TemplateField, type Values,
} from '@/features/announcements/templates';
import { LANGUAGE_LABELS, severityMeta } from '@/features/announcements/labels';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  RIVER_LEVEL: Waves,
  RAINFALL: CloudRain,
  FLOOD: Droplets,
  EVACUATION: DoorOpen,
  CLASS_SUSPENSION: School,
  ROAD_CLOSURE: Construction,
  GENERAL: Megaphone,
};

const SEVERITIES: Severity[] = ['INFORMATIONAL', 'ADVISORY', 'WARNING', 'CRITICAL'];

const inputCls =
  'w-full rounded-lg border border-[rgba(168,181,193,0.35)] bg-white px-3 py-2 text-sm text-agap-textMain ' +
  'placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green focus:border-transparent';

const labelCls = 'mb-1.5 block text-xs font-semibold text-agap-textMid';

/** Persisted in `template_data` so a draft re-opens exactly as it was left. */
interface ComposerState {
  values: Values;
  issuer: IssuerKey;
  otherIssuer: string;
  wholeMunicipality: boolean;
  actions: string[];
  extraAction: string;
  manual: boolean;
  severityTouched: boolean;
}

// ─── Small building blocks ────────────────────────────────────────────────────

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[rgba(168,181,193,0.25)] bg-white p-5">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-agap-textMain text-xs font-bold text-white">
          {step}
        </span>
        <div>
          <h2 className="text-sm font-bold text-agap-textMain">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-agap-textSub">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldInput({ f, value, onChange }: { f: TemplateField; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `f-${f.key}`;
  const req = f.required ? <span className="text-agap-danger"> *</span> : null;

  if (f.type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[rgba(168,181,193,0.35)] px-3 py-2.5">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-agap-green"
        />
        <span>
          <span className="text-sm font-semibold text-agap-textMain">{f.label}{req}</span>
          {f.help && <span className="mt-0.5 block text-xs text-agap-textSub">{f.help}</span>}
        </span>
      </label>
    );
  }

  if (f.type === 'multicheck') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className={labelCls}>{f.label}{req}</legend>
        <div className="flex flex-wrap gap-1.5">
          {f.options?.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  on
                    ? 'border-agap-green bg-agap-green text-white'
                    : 'border-[rgba(168,181,193,0.35)] bg-white text-agap-textMid hover:border-agap-green',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const v = typeof value === 'string' ? value : '';
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{f.label}{req}</label>
      {f.type === 'textarea' ? (
        <textarea id={id} rows={3} value={v} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'resize-y')} />
      ) : f.type === 'select' ? (
        <select id={id} value={v} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Select…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.hint ? `${o.label} — ${o.hint}` : o.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={f.type === 'datetime' ? 'datetime-local' : f.type}
          step={f.step}
          value={v}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {f.help && <p className="mt-1 text-xs text-agap-textSub">{f.help}</p>}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('id');
  const user = useAuthUser();
  const canPublish = hasRole(user, 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR');

  const existingQ = useAnnouncement(editId);
  const existing = existingQ.data;
  const existingImage = useAnnouncementImage(editId, !!existing?.image_storage_key, existing?.updated_at);

  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [state, setState] = useState<ComposerState>({
    values: {}, issuer: 'MAYOR', otherIssuer: '', wholeMunicipality: true,
    actions: [], extraAction: '', manual: false, severityTouched: false,
  });
  const [language, setLanguage] = useState<LanguageMode>('FIL');
  const [barangays, setBarangays] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [contact, setContact] = useState('');
  const [severity, setSeverity] = useState<Severity>('ADVISORY');
  const [manualText, setManualText] = useState({ title: '', summary: '', body: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const upload = useUploadAnnouncementImage();
  const publish = usePublishAnnouncement();

  const template = getTemplate(templateKey);

  // ── Load an existing draft once ──
  useEffect(() => {
    if (!existing || loadedId === existing.id) return;
    setLoadedId(existing.id);
    const saved = (existing.template_data ?? {}) as Partial<ComposerState>;
    setTemplateKey(existing.template_key ?? 'GENERAL');
    setState({
      values: saved.values ?? {},
      issuer: saved.issuer ?? 'MAYOR',
      otherIssuer: saved.otherIssuer ?? '',
      wholeMunicipality: saved.wholeMunicipality ?? existing.scope === 'MUNICIPALITY_WIDE',
      actions: saved.actions ?? [],
      extraAction: saved.extraAction ?? '',
      // Drafts made before templates existed have no field values — edit their text directly.
      manual: saved.manual ?? !existing.template_key,
      severityTouched: true,
    });
    setLanguage(existing.language ?? 'FIL');
    setBarangays(existing.target_barangays ?? []);
    setSource(existing.source_reference ?? '');
    setContact(existing.contact_info ?? '');
    setSeverity(existing.severity as Severity);
    setManualText({ title: existing.title, summary: existing.summary ?? '', body: existing.body ?? '' });
    setImageAlt(existing.image_alt_text ?? '');
  }, [existing, loadedId]);

  const pickTemplate = useCallback((t: AnnouncementTemplate) => {
    setTemplateKey(t.key);
    setState((s) => ({
      ...s,
      values: {},
      actions: t.defaultActions,
      wholeMunicipality: !t.requiresArea,
      manual: false,
      severityTouched: false,
    }));
    setSeverity(t.defaultSeverity);
    setError(null);
  }, []);

  const office = useMemo<Record<'FIL' | 'EN', string>>(() => {
    if (state.issuer === 'OTHER') return { FIL: state.otherIssuer.trim(), EN: state.otherIssuer.trim() };
    return { ...ISSUERS[state.issuer] };
  }, [state.issuer, state.otherIssuer]);

  const common: CommonInput = useMemo(() => ({
    barangays: state.wholeMunicipality ? [] : barangays,
    wholeMunicipality: state.wholeMunicipality,
    office,
    source: source.trim(),
    contact: contact.trim(),
    actions: template?.usesActions ? state.actions : [],
    extraAction: template?.usesActions ? state.extraAction : '',
  }), [state.wholeMunicipality, state.actions, state.extraAction, barangays, office, source, contact, template]);

  const suggested: Severity | null = template?.suggestSeverity ? template.suggestSeverity(state.values) : null;

  // Follow the suggested severity until the operator overrides it.
  useEffect(() => {
    if (suggested && !state.severityTouched) setSeverity(suggested);
  }, [suggested, state.severityTouched]);

  const generated = useMemo(
    () => (template ? generate(template, state.values, language, common) : null),
    [template, state.values, language, common],
  );

  const text = state.manual
    ? { ...manualText, push: { title: manualText.title, body: manualText.summary } }
    : generated
      ? { title: generated.title, summary: generated.summary, body: generated.body, push: generated.push }
      : { title: '', summary: '', body: '', push: { title: '', body: '' } };

  const checks = template ? readiness(template, state.values, common, severity, { manualText: state.manual }) : [];
  const ready = !!template && checks.every((c) => c.ok) && text.title.trim().length >= 3 && text.body.trim().length > 0;

  const setValue = (key: string, v: Values[string]) =>
    setState((s) => ({ ...s, values: { ...s.values, [key]: v } }));

  function startManualEdit() {
    setManualText({ title: text.title, summary: text.summary, body: text.body });
    setState((s) => ({ ...s, manual: true }));
  }

  function backToGenerated() {
    setState((s) => ({ ...s, manual: false }));
  }

  // ── Image ──
  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Image must be JPEG, PNG, or WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  }
  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const shownImage = imagePreview ?? existingImage.url;

  const preview: PreviewModel = {
    title: text.title,
    summary: text.summary,
    body: text.body,
    severity,
    category: template?.category ?? 'PUBLIC_ADVISORY',
    issuingOffice: generated?.issuingOffice ?? office.FIL,
    sourceReference: source.trim(),
    areaText: cap(areaText(common, language === 'EN' ? 'EN' : 'FIL')),
    timeLabel: 'Just now',
    imageUrl: shownImage,
    imageAlt: imageAlt || 'Announcement image',
    push: text.push,
  };

  // ── Save ──
  function buildBody(): CreateAnnouncementBody | null {
    if (!template) return null;
    const eff = template.effective?.(state.values) ?? {};
    const scope = state.wholeMunicipality || barangays.length === 0 ? 'MUNICIPALITY_WIDE' : 'BARANGAY_SPECIFIC';
    const templateData: ComposerState = { ...state };
    const startIso = eff.start ? manilaInputToIso(eff.start) : undefined;
    const endIso = eff.end ? manilaInputToIso(eff.end) : undefined;
    return {
      title: text.title.trim(),
      body: text.body.trim(),
      summary: text.summary.trim().slice(0, 400),
      category: template.category,
      severity,
      scope,
      targetBarangays: scope === 'BARANGAY_SPECIFIC' ? barangays : [],
      templateKey: template.key,
      templateData: templateData as unknown as Record<string, unknown>,
      language,
      actionRequired: state.manual ? '' : (generated?.actionRequired ?? ''),
      issuingOffice: (generated?.issuingOffice ?? office.FIL).slice(0, 200),
      sourceReference: source.trim(),
      contactInfo: contact.trim(),
      imageAltText: imageAlt.trim(),
      ...(startIso && { effectiveStartAt: startIso }),
      ...(endIso && { effectiveEndAt: endIso }),
    };
  }

  async function save(): Promise<string | null> {
    const body = buildBody();
    if (!body) { setError('Choose a template first.'); return null; }
    if (body.title.length < 3 || !body.body) { setError('Headline and announcement text are required.'); return null; }
    setError(null);
    try {
      const saved = editId
        ? await update.mutateAsync({ id: editId, body })
        : await create.mutateAsync(body);
      if (imageFile) {
        try {
          await upload.mutateAsync({ id: saved.id, file: imageFile });
        } catch (e) {
          // The draft is saved; tell the operator the image specifically failed.
          setError(`Draft saved, but the image did not upload: ${e instanceof Error ? e.message : 'unknown error'}`);
          if (!editId) router.replace(`/announcements/compose?id=${saved.id}`);
          return null;
        }
      }
      return saved.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the draft.');
      return null;
    }
  }

  async function onSaveDraft() {
    const id = await save();
    if (id) router.push(`/announcements?saved=${id}`);
  }

  async function onConfirmPublish() {
    const id = await save();
    if (!id) { setConfirmOpen(false); return; }
    try {
      await publish.mutateAsync(id);
      router.push(`/announcements?published=${id}`);
    } catch (e) {
      setConfirmOpen(false);
      setError(`Saved as draft, but not published: ${e instanceof Error ? e.message : 'unknown error'}`);
      if (!editId) router.replace(`/announcements/compose?id=${id}`);
    }
  }

  const busy = create.isPending || update.isPending || upload.isPending || publish.isPending;

  if (!canPublish) {
    return (
      <div className="rounded-2xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft px-5 py-4 text-sm text-agap-textMid">
        You need the <span className="font-semibold">Announcements Publisher</span> role to compose announcements.
      </div>
    );
  }

  if (editId && existingQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (existing && existing.status !== 'DRAFT') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-agap-textMid">Only drafts can be edited. This announcement is {existing.status.toLowerCase()}.</p>
        <Link href="/announcements" className="text-sm font-semibold text-agap-green">Back to announcements</Link>
      </div>
    );
  }

  const sevMeta = severityMeta(severity);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link href="/announcements" className="inline-flex items-center gap-1 text-xs font-semibold text-agap-textSub hover:text-agap-textMain">
          <ArrowLeft size={14} /> Announcements
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-agap-textMain">
          {editId ? 'Edit draft' : 'New announcement'}
        </h1>
        <p className="mt-0.5 text-sm text-agap-textSub">
          Pick a template, fill in the confirmed details — the headline, summary, full notice and push text are written for you.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* ── Left: form ── */}
        <div className="min-w-0 space-y-4">
          <Section step={1} title="What kind of announcement?">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICONS[t.key] ?? Megaphone;
                const on = templateKey === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => !on && pickTemplate(t)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                      on
                        ? 'border-agap-green bg-agap-greenSoft'
                        : 'border-[rgba(168,181,193,0.35)] bg-white hover:border-agap-green/60',
                    )}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      on ? 'bg-agap-green text-white' : 'bg-agap-surface text-agap-textMid',
                    )}>
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-agap-textMain">{t.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-agap-textSub">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {template && (
            <>
              <Section step={2} title="Confirmed details" hint="Enter only verified information. Leave optional fields blank rather than guessing.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visibleFields(template, state.values).map((f) => (
                    <div key={f.key} className={cn(!f.half && 'sm:col-span-2')}>
                      <FieldInput f={f} value={state.values[f.key]} onChange={(v) => setValue(f.key, v)} />
                    </div>
                  ))}
                </div>

                {template.usesActions && (
                  <div className="mt-4 border-t border-agap-surface pt-4">
                    <p className={labelCls}>Instructions to residents</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {Object.entries(SAFETY_ACTIONS).map(([key, a]) => {
                        const on = state.actions.includes(key);
                        return (
                          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-agap-textMid hover:bg-agap-pearl">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setState((s) => ({
                                  ...s,
                                  actions: on ? s.actions.filter((x) => x !== key) : [...s.actions, key],
                                }))
                              }
                              className="h-4 w-4 accent-agap-green"
                            />
                            {a.label}
                          </label>
                        );
                      })}
                    </div>
                    <textarea
                      rows={2}
                      value={state.extraAction}
                      onChange={(e) => setState((s) => ({ ...s, extraAction: e.target.value }))}
                      placeholder="Other verified instructions — one per line"
                      className={cn(inputCls, 'mt-2 resize-y')}
                    />
                  </div>
                )}
              </Section>

              <Section step={3} title="Area, issuer and source">
                <div className="space-y-4">
                  <div>
                    <p className={labelCls}>
                      Affected area{template.requiresArea && <span className="text-agap-danger"> *</span>}
                    </p>
                    <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm font-medium text-agap-textMain">
                      <input
                        type="checkbox"
                        checked={state.wholeMunicipality}
                        onChange={(e) => setState((s) => ({ ...s, wholeMunicipality: e.target.checked }))}
                        className="h-4 w-4 accent-agap-green"
                      />
                      Buong Bocaue (municipality-wide)
                    </label>
                    {!state.wholeMunicipality && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {BOCAUE_BARANGAYS.map((b) => {
                            const on = barangays.includes(b);
                            return (
                              <button
                                key={b}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setBarangays((list) => (on ? list.filter((x) => x !== b) : [...list, b]))}
                                className={cn(
                                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                                  on
                                    ? 'border-agap-textMain bg-agap-textMain text-white'
                                    : 'border-[rgba(168,181,193,0.35)] bg-white text-agap-textMid hover:border-agap-textMain',
                                )}
                              >
                                {b}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-2 flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => setBarangays((list) => Array.from(new Set([...list, ...FLOOD_PRONE_BARANGAYS])))}
                            className="font-semibold text-agap-green hover:underline"
                          >
                            + Flood-prone (Lolomboy, Bunlo, Igulot, Bambang)
                          </button>
                          {barangays.length > 0 && (
                            <button type="button" onClick={() => setBarangays([])} className="text-agap-textSub hover:underline">
                              Clear
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="issuer" className={labelCls}>Issued by <span className="text-agap-danger">*</span></label>
                      <select
                        id="issuer"
                        value={state.issuer}
                        onChange={(e) => setState((s) => ({ ...s, issuer: e.target.value as IssuerKey }))}
                        className={inputCls}
                      >
                        <option value="MAYOR">Office of the Mayor</option>
                        <option value="MAYOR_MDRRMO">Office of the Mayor + MDRRMO</option>
                        <option value="MDRRMO">MDRRMO</option>
                        <option value="OTHER">Other office…</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="lang" className={labelCls}>Language</label>
                      <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as LanguageMode)} className={inputCls}>
                        {(Object.keys(LANGUAGE_LABELS) as LanguageMode[]).map((k) => (
                          <option key={k} value={k}>{LANGUAGE_LABELS[k]}</option>
                        ))}
                      </select>
                    </div>
                    {state.issuer === 'OTHER' && (
                      <div className="sm:col-span-2">
                        <label htmlFor="otherIssuer" className={labelCls}>Office name</label>
                        <input
                          id="otherIssuer"
                          value={state.otherIssuer}
                          onChange={(e) => setState((s) => ({ ...s, otherIssuer: e.target.value }))}
                          placeholder="e.g. Municipal Engineering Office"
                          className={inputCls}
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label htmlFor="source" className={labelCls}>
                        Source / reference
                        {checks.find((c) => c.label.startsWith('Verified source')) && <span className="text-agap-danger"> *</span>}
                      </label>
                      <input
                        id="source"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder="e.g. PAGASA Heavy Rainfall Warning No. 3; MDRRMO river gauge reading"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="contact" className={labelCls}>Contact for questions</label>
                      <input
                        id="contact"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder="Verified office and number only"
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>
              </Section>

              <Section step={4} title="Image" hint="Optional — approved poster, map or photo. JPEG, PNG or WebP up to 5 MB.">
                {shownImage ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shownImage} alt={imageAlt || 'Selected announcement image'} className="h-36 w-full rounded-xl border border-[rgba(168,181,193,0.25)] object-cover sm:w-56" />
                    <div className="flex-1 space-y-2">
                      <div>
                        <label htmlFor="alt" className={labelCls}>Image description (for screen readers)</label>
                        <input
                          id="alt"
                          value={imageAlt}
                          maxLength={300}
                          onChange={(e) => setImageAlt(e.target.value)}
                          placeholder="e.g. Map of flooded streets in Brgy. Lolomboy"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                          <ImagePlus size={14} /> Replace
                        </Button>
                        {imageFile && (
                          <Button type="button" variant="ghost" size="sm" onClick={clearImage}>
                            <X size={14} /> Remove
                          </Button>
                        )}
                      </div>
                      {imageFile && <p className="truncate text-xs text-agap-textSub">{imageFile.name} · uploads when you save</p>}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(168,181,193,0.6)] bg-agap-pearl px-4 py-8 text-sm font-medium text-agap-textSub transition-colors hover:border-agap-green hover:text-agap-green"
                  >
                    <ImagePlus size={18} aria-hidden /> Attach an image
                  </button>
                )}
                {existingImage.isError && !imagePreview && (
                  <p className="mt-2 text-xs text-agap-amber">The saved image could not be loaded from storage.</p>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickImage} />
              </Section>

              <Section step={5} title="Review the text" hint={state.manual ? 'Editing by hand — field changes above no longer update the text.' : 'Generated from the fields above.'}>
                {state.manual ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="mt" className={labelCls}>Headline</label>
                      <input id="mt" value={manualText.title} onChange={(e) => setManualText((m) => ({ ...m, title: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="ms" className={labelCls}>Summary (also used for push and SMS)</label>
                      <textarea id="ms" rows={2} maxLength={400} value={manualText.summary} onChange={(e) => setManualText((m) => ({ ...m, summary: e.target.value }))} className={cn(inputCls, 'resize-y')} />
                    </div>
                    <div>
                      <label htmlFor="mb" className={labelCls}>Full announcement</label>
                      <textarea id="mb" rows={14} value={manualText.body} onChange={(e) => setManualText((m) => ({ ...m, body: e.target.value }))} className={cn(inputCls, 'resize-y font-mono text-[13px] leading-relaxed')} />
                    </div>
                    {template && (
                      <Button type="button" variant="ghost" size="sm" onClick={backToGenerated}>
                        <RotateCcw size={14} /> Discard edits and use generated text
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-agap-pearl px-4 py-3">
                      <p className="text-xs font-semibold text-agap-textSub">Headline</p>
                      <p className="mt-0.5 text-sm font-bold text-agap-textMain">{text.title || '—'}</p>
                      <p className="mt-2 text-xs font-semibold text-agap-textSub">Summary</p>
                      <p className="mt-0.5 text-sm text-agap-textMid">{text.summary || '—'}</p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={startManualEdit}>
                      <PencilLine size={14} /> Edit text by hand
                    </Button>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* ── Right: preview + approval ── */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <AnnouncementPreview model={preview} />

          {template && (
            <div className="space-y-4 rounded-2xl border border-[rgba(168,181,193,0.25)] bg-white p-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="sev" className="text-xs font-semibold text-agap-textMid">Severity</label>
                  {suggested && state.severityTouched && suggested !== severity && (
                    <button
                      type="button"
                      onClick={() => { setState((s) => ({ ...s, severityTouched: false })); setSeverity(suggested); }}
                      className="text-xs font-semibold text-agap-green hover:underline"
                    >
                      Use suggested: {severityMeta(suggested).label}
                    </button>
                  )}
                </div>
                <select
                  id="sev"
                  value={severity}
                  onChange={(e) => { setSeverity(e.target.value as Severity); setState((s) => ({ ...s, severityTouched: true })); }}
                  className={inputCls}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {severityMeta(s).label} · {severityMeta(s).priority}{suggested === s && !state.severityTouched ? ' (auto)' : ''}
                    </option>
                  ))}
                </select>
                {severity === 'CRITICAL' && (
                  <p className="mt-1.5 text-xs text-agap-textSub">Critical notices are pinned at the top of the citizen app.</p>
                )}
              </div>

              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-xs">
                    {c.ok
                      ? <Check size={14} className="shrink-0 text-agap-green" aria-label="Done" />
                      : <CircleAlert size={14} className="shrink-0 text-agap-amber" aria-label="Missing" />}
                    <span className={c.ok ? 'text-agap-textMid' : 'font-semibold text-agap-textMain'}>{c.label}</span>
                  </li>
                ))}
              </ul>

              {error && (
                <p role="alert" className="rounded-lg border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-3 py-2 text-xs text-agap-danger">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button variant="secondary" className="flex-1" loading={busy && !confirmOpen} onClick={onSaveDraft} disabled={busy}>
                  Save draft
                </Button>
                <Button variant="primary" className="flex-1" disabled={!ready || busy} onClick={() => setConfirmOpen(true)}>
                  <Send size={14} /> Review &amp; publish
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-agap-textSub">
                Nothing is sent until you approve it. Drafts are never visible to residents.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Approval confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !publish.isPending && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish as an official announcement?</DialogTitle>
            <DialogDescription>
              You are approving this notice for release by <span className="font-semibold text-agap-textMain">{preview.issuingOffice}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl bg-agap-pearl px-4 py-3 text-sm">
            <p className="font-bold text-agap-textMain">{text.title}</p>
            <p className="text-agap-textMid">{text.summary}</p>
            <p className={cn('flex items-center gap-1.5 text-xs font-semibold', sevMeta.text)}>
              <sevMeta.icon size={13} aria-hidden /> {sevMeta.label}
              <span className="font-normal text-agap-textSub">
                · {state.wholeMunicipality || barangays.length === 0 ? 'All of Bocaue' : barangays.join(', ')}
              </span>
            </p>
          </div>
          <p className="text-xs text-agap-textSub">
            It appears in the citizen app immediately and is sent by push and SMS to subscribers. Corrections are issued by cancelling it with a note — published text cannot be edited.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>Back</Button>
            <Button variant="primary" loading={busy} onClick={onConfirmPublish}>
              <Send size={14} /> Approve &amp; publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComposeAnnouncementPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Composer />
    </Suspense>
  );
}
