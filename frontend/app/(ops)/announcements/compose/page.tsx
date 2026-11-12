'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Check, CircleAlert, CloudRain, Construction, DoorOpen, Droplets,
  ImagePlus, Megaphone, PencilLine, RotateCcw, School, Send, Sparkles, Waves, X,
  type LucideIcon,
} from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { confirmAction, escapeHtml, notify } from '@/components/ui/alerts';
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
  useSubmitAnnouncement,
  useAnnouncementPolicy,
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

// ui-ux-pro-max: visible focus, 3:1 control borders, 4.5:1 helper text,
// 44px touch targets on small screens, motion only when the user allows it.
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-2';

const inputCls =
  'min-h-10 w-full rounded-lg border border-agap-fieldBorder bg-white px-3 py-2 text-sm text-agap-textMain ' +
  'placeholder:text-agap-hint hover:border-agap-textMid motion-safe:transition-colors ' +
  'focus:outline-none focus:border-agap-green focus:ring-2 focus:ring-agap-green/30';

const labelCls = 'mb-1.5 block text-xs font-semibold text-agap-textMid';
const hintCls = 'mt-1 text-xs leading-snug text-agap-hint';

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

function Section({
  step, title, hint, done, aside, children,
}: { step: number; title: string; hint?: string | undefined; done?: boolean | undefined; aside?: ReactNode; children: ReactNode }) {
  const headingId = `step-${step}-title`;
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-agap-track bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white motion-safe:transition-colors',
            done ? 'bg-agap-green' : 'bg-agap-textMain',
          )}
        >
          {done ? <Check size={14} aria-label={`Step ${step} done`} /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[15px] font-bold leading-7 text-agap-textMain">{title}</h2>
          {hint && <p className="text-xs leading-snug text-agap-hint">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Visible asterisk for sighted users, the word "required" for screen readers. */
function RequiredMark() {
  return (
    <>
      <span className="text-agap-danger" aria-hidden> *</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** A toggle chip: selected state is shown by a check icon as well as colour. */
function SelectChip({
  on, onClick, icon, children, title,
}: { on: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode; title?: string | undefined }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold sm:min-h-9',
        'motion-safe:transition-colors',
        focusRing,
        on
          ? 'border-agap-green bg-agap-green text-white'
          : 'border-agap-fieldBorder bg-white text-agap-textMid hover:border-agap-green hover:text-agap-textMain',
      )}
    >
      {on ? <Check size={13} aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Checkbox presented as a card; the whole card is the hit area. */
function CheckCard({
  id, checked, onChange, title, help, compact,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; title: ReactNode; help?: string | undefined; compact?: boolean | undefined }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-11 cursor-pointer gap-2.5 rounded-lg border px-3 motion-safe:transition-colors',
        'focus-within:ring-2 focus-within:ring-agap-green focus-within:ring-offset-1',
        compact ? 'items-center py-2' : 'items-start py-2.5',
        checked ? 'border-agap-green bg-agap-greenSoft' : 'border-agap-fieldBorder bg-white hover:border-agap-textMid',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={help ? `${id}-help` : undefined}
        className={cn('h-4 w-4 shrink-0 accent-agap-green focus:outline-none', !compact && 'mt-0.5')}
      />
      <span className="min-w-0">
        <span className={cn('block text-sm text-agap-textMain', compact ? 'font-medium' : 'font-semibold')}>{title}</span>
        {help && <span id={`${id}-help`} className="mt-0.5 block text-xs leading-snug text-agap-hint">{help}</span>}
      </span>
    </label>
  );
}

function SelectedCount({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-agap-greenSoft px-1.5 py-0.5 text-[11px] font-bold text-agap-green">
      {n} selected
    </span>
  );
}

function FieldInput({ f, value, onChange }: { f: TemplateField; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = `f-${f.key}`;
  const helpId = f.help ? `${id}-help` : undefined;
  const req = f.required ? <RequiredMark /> : null;

  if (f.type === 'checkbox') {
    return (
      <CheckCard
        id={id}
        checked={value === true}
        onChange={(v) => onChange(v)}
        title={<>{f.label}{req}</>}
        help={f.help}
      />
    );
  }

  if (f.type === 'multicheck') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset aria-describedby={helpId}>
        <legend className={cn(labelCls, 'flex items-center')}>
          <span>{f.label}{req}</span>
          <SelectedCount n={selected.length} />
        </legend>
        <div className="flex flex-wrap gap-2">
          {f.options?.map((o) => {
            const on = selected.includes(o.value);
            return (
              <SelectChip
                key={o.value}
                on={on}
                title={o.hint}
                onClick={() => onChange(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
              >
                {o.label}
              </SelectChip>
            );
          })}
        </div>
        {f.help && <p id={helpId} className={hintCls}>{f.help}</p>}
      </fieldset>
    );
  }

  const v = typeof value === 'string' ? value : '';
  const common = {
    id,
    'aria-required': f.required || undefined,
    'aria-describedby': helpId,
  } as const;
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{f.label}{req}</label>
      {f.type === 'textarea' ? (
        <textarea {...common} rows={3} value={v} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'resize-y')} />
      ) : f.type === 'select' ? (
        <select {...common} value={v} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
          <option value="">Select…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.hint ? `${o.label} — ${o.hint}` : o.label}</option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={f.type === 'datetime' ? 'datetime-local' : f.type}
          step={f.step}
          value={v}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {f.help && <p id={helpId} className={hintCls}>{f.help}</p>}
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
  // True while the publish confirmation is up; its own button shows the progress.
  const [confirming, setConfirming] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // A new draft created by a save whose next step failed, so a retry updates it
  // instead of creating a second copy.
  const createdId = useRef<string | null>(null);

  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const upload = useUploadAnnouncementImage();
  const publish = usePublishAnnouncement();
  const submit = useSubmitAnnouncement();
  const policy = useAnnouncementPolicy(canPublish);

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

  const applyTemplate = useCallback((t: AnnouncementTemplate) => {
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
  const checksDone = checks.filter((c) => c.ok).length;

  const setValue = (key: string, v: Values[string]) =>
    setState((s) => ({ ...s, values: { ...s.values, [key]: v } }));

  // Switching templates clears step 2 and any hand edits, so ask once there is something to lose.
  const hasDetails =
    state.manual ||
    Object.values(state.values).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== false && v != null));

  async function pickTemplate(t: AnnouncementTemplate) {
    if (template && hasDetails) {
      const ok = await confirmAction({
        title: `Switch to “${t.label}”?`,
        text: `The details in step 2${state.manual ? ' and your hand edits to the text' : ''} are cleared. The barangays, issuer, source, contact and image you set stay.`,
        confirmText: 'Switch template',
        cancelText: 'Keep current',
        icon: 'warning',
      });
      if (!ok) return;
    }
    applyTemplate(t);
  }

  function startManualEdit() {
    setManualText({ title: text.title, summary: text.summary, body: text.body });
    setState((s) => ({ ...s, manual: true }));
  }

  async function backToGenerated() {
    const ok = await confirmAction({
      title: 'Discard your edits?',
      text: 'The text goes back to what the template writes from your details. Your hand edits are lost.',
      confirmText: 'Discard edits',
      cancelText: 'Keep editing',
      tone: 'danger',
      icon: 'warning',
    });
    if (ok) setState((s) => ({ ...s, manual: false }));
  }

  // ── Image ──
  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reject = (text: string) => {
      if (fileRef.current) fileRef.current.value = '';
      void notify('warning', { title: 'Image not attached', text });
    };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { reject('It must be a JPEG, PNG or WebP file.'); return; }
    if (file.size > 5 * 1024 * 1024) { reject('It must be under 5 MB.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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

  type SaveResult = { id: string } | { error: string; title: string };

  async function save(): Promise<SaveResult> {
    const body = buildBody();
    if (!body) return { title: 'Draft not saved', error: 'Choose a template first.' };
    if (body.title.length < 3 || !body.body) return { title: 'Draft not saved', error: 'Headline and announcement text are required.' };
    const draftId = editId ?? createdId.current;
    let savedId: string;
    try {
      const saved = draftId
        ? await update.mutateAsync({ id: draftId, body })
        : await create.mutateAsync(body);
      savedId = saved.id;
    } catch (e) {
      return { title: 'Draft not saved', error: e instanceof Error ? e.message : 'Could not save the draft.' };
    }
    if (!editId) createdId.current = savedId;
    if (imageFile) {
      try {
        await upload.mutateAsync({ id: savedId, file: imageFile });
      } catch (e) {
        // The draft is saved; tell the operator the image specifically failed.
        return {
          title: 'Image not uploaded',
          error: `Draft saved, but the image did not upload: ${e instanceof Error ? e.message : 'unknown error'}`,
        };
      }
    }
    return { id: savedId };
  }

  /** After a failed step, point the URL at the draft that was saved so a refresh reopens it. */
  function rememberSavedDraft() {
    if (!editId && createdId.current) router.replace(`/announcements/compose?id=${createdId.current}`);
  }

  async function onSaveDraft() {
    setError(null);
    const result = await save();
    if ('id' in result) {
      router.push(`/announcements?saved=${result.id}`);
      return;
    }
    setError(result.error);
    void notify('error', { title: result.title, text: result.error });
    rememberSavedDraft();
  }

  // Phase 7: with approval on, a CRITICAL notice goes to an MDRRMO Supervisor instead.
  const needsApproval = !!policy.data?.criticalNeedsApproval && severity === 'CRITICAL';

  function publishSummaryHtml(): string {
    const sev = severityMeta(severity);
    const area = state.wholeMunicipality || barangays.length === 0 ? 'All of Bocaue' : barangays.join(', ');
    const lead = needsApproval
      ? `An MDRRMO Supervisor reviews this notice for <strong class="text-agap-textMain">${escapeHtml(preview.issuingOffice)}</strong> before anything is sent.`
      : `You are approving this notice for release by <strong class="text-agap-textMain">${escapeHtml(preview.issuingOffice)}</strong>.`;
    const after = needsApproval
      ? 'It is locked while it waits. Once approved it appears in the citizen app and goes to push and SMS subscribers. If it is returned, you will see the reason on the Announcements page.'
      : 'It appears in the citizen app immediately and is sent by push and SMS to subscribers. Corrections are issued by cancelling it with a note — published text cannot be edited.';
    return (
      `<p>${lead}</p>` +
      `<div class="mt-3 rounded-xl border border-agap-track bg-agap-pearl px-4 py-3">` +
      `<p class="font-bold text-agap-textMain">${escapeHtml(text.title)}</p>` +
      (text.summary ? `<p class="mt-1 text-[13px] text-agap-textMid">${escapeHtml(text.summary)}</p>` : '') +
      `<p class="mt-2 text-[12px] font-semibold ${sev.text}">${escapeHtml(sev.label)} · ${escapeHtml(sev.priority)}` +
      `<span class="font-normal text-agap-textSub"> · ${escapeHtml(area)}</span></p>` +
      `</div>` +
      `<p class="mt-3 text-[13px]">${escapeHtml(after)}</p>`
    );
  }

  async function onPublish() {
    setError(null);
    let releasedId: string | null = null;
    let failure: string | null = null;
    setConfirming(true);
    try {
      const ok = await confirmAction({
        title: needsApproval ? 'Submit for MDRRMO approval?' : 'Publish as an official announcement?',
        html: publishSummaryHtml(),
        icon: needsApproval ? 'question' : 'warning',
        confirmText: needsApproval ? 'Submit for approval' : 'Approve & publish',
        cancelText: 'Back',
        // Saves, then releases, with progress and any failure shown in the popup.
        onConfirm: async () => {
          const result = await save();
          if (!('id' in result)) {
            failure = result.error;
            throw new Error(result.error);
          }
          try {
            if (needsApproval) await submit.mutateAsync({ id: result.id });
            else await publish.mutateAsync(result.id);
          } catch (e) {
            failure = `Saved as draft, but not ${needsApproval ? 'submitted' : 'published'}: ${e instanceof Error ? e.message : 'unknown error'}`;
            throw new Error(failure);
          }
          releasedId = result.id;
        },
      });
      if (ok && releasedId) {
        router.push(`/announcements?${needsApproval ? 'submitted' : 'published'}=${releasedId}`);
        return;
      }
      // Closed after a failure: keep the reason on the page next to the buttons.
      if (failure) setError(failure);
      rememberSavedDraft();
    } finally {
      setConfirming(false);
    }
  }

  const busy = create.isPending || update.isPending || upload.isPending || publish.isPending || submit.isPending;

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
          <Section
            step={1}
            title="What kind of announcement?"
            done={!!template}
            hint={
              template
                ? 'Switching templates clears the details in step 2.'
                : 'Each template writes the headline, summary, full notice and push text from the details you confirm.'
            }
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICONS[t.key] ?? Megaphone;
                const on = templateKey === t.key;
                const sev = severityMeta(t.defaultSeverity);
                const SevIcon = sev.icon;
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => !on && pickTemplate(t)}
                    className={cn(
                      'group relative flex min-h-[92px] flex-col gap-2 rounded-xl border p-3 text-left',
                      'motion-safe:transition-[border-color,background-color,box-shadow]',
                      focusRing,
                      on
                        ? 'border-agap-green bg-agap-greenSoft ring-1 ring-agap-green'
                        : 'border-agap-track bg-white hover:border-agap-green/70 hover:shadow-card',
                    )}
                  >
                    {on && (
                      <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-agap-green text-white">
                        <Check size={12} aria-hidden />
                      </span>
                    )}
                    <span className="flex items-start gap-3 pr-6">
                      <span className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg motion-safe:transition-colors',
                        on ? 'bg-agap-green text-white' : 'bg-agap-surface text-agap-textMid group-hover:text-agap-green',
                      )}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-snug text-agap-textMain">{t.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-agap-hint">{t.description}</span>
                      </span>
                    </span>
                    <span className={cn('mt-auto inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', sev.soft, sev.text)}>
                      <SevIcon size={11} aria-hidden /> Starts as {sev.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {template && (
            <>
              <Section step={2} title="Confirmed details" hint="Enter only verified information. Leave optional fields blank rather than guessing.">
                <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                  {visibleFields(template, state.values).map((f) => (
                    <div key={f.key} className={cn(!f.half && 'sm:col-span-2')}>
                      <FieldInput f={f} value={state.values[f.key]} onChange={(v) => setValue(f.key, v)} />
                    </div>
                  ))}
                </div>

                {template.usesActions && (
                  <fieldset className="mt-5 border-t border-agap-surface pt-4">
                    <legend className={cn(labelCls, 'flex items-center')}>
                      <span>Instructions to residents</span>
                      <SelectedCount n={state.actions.length} />
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(SAFETY_ACTIONS).map(([key, a]) => {
                        const on = state.actions.includes(key);
                        return (
                          <CheckCard
                            key={key}
                            id={`action-${key}`}
                            compact
                            checked={on}
                            onChange={() =>
                              setState((s) => ({
                                ...s,
                                actions: on ? s.actions.filter((x) => x !== key) : [...s.actions, key],
                              }))
                            }
                            title={a.label}
                          />
                        );
                      })}
                    </div>
                    <label htmlFor="extraAction" className={cn(labelCls, 'mt-3')}>
                      Other instructions <span className="font-normal text-agap-hint">(optional)</span>
                    </label>
                    <textarea
                      id="extraAction"
                      rows={2}
                      value={state.extraAction}
                      onChange={(e) => setState((s) => ({ ...s, extraAction: e.target.value }))}
                      placeholder="Other verified instructions — one per line"
                      aria-describedby="extraAction-help"
                      className={cn(inputCls, 'resize-y')}
                    />
                    <p id="extraAction-help" className={hintCls}>Each line becomes its own instruction in the notice.</p>
                  </fieldset>
                )}
              </Section>

              <Section step={3} title="Area, issuer and source">
                <div className="space-y-4">
                  <fieldset>
                    <legend className={cn(labelCls, 'flex items-center')}>
                      <span>Affected area{template.requiresArea && <RequiredMark />}</span>
                      {!state.wholeMunicipality && <SelectedCount n={barangays.length} />}
                    </legend>
                    <CheckCard
                      id="wholeMunicipality"
                      checked={state.wholeMunicipality}
                      onChange={(v) => setState((s) => ({ ...s, wholeMunicipality: v }))}
                      title="Buong Bocaue (municipality-wide)"
                      help={state.wholeMunicipality ? 'Uncheck to choose specific barangays.' : 'Choose the affected barangays below.'}
                    />
                    {!state.wholeMunicipality && (
                      <div className="mt-3 rounded-xl bg-agap-pearl p-3">
                        <div className="flex flex-wrap gap-2">
                          {BOCAUE_BARANGAYS.map((b) => {
                            const on = barangays.includes(b);
                            const floodProne = (FLOOD_PRONE_BARANGAYS as readonly string[]).includes(b);
                            return (
                              <SelectChip
                                key={b}
                                on={on}
                                title={floodProne ? 'Flood-prone barangay' : undefined}
                                icon={floodProne ? <Droplets size={12} className="text-agap-info" aria-label="Flood-prone" /> : undefined}
                                onClick={() => setBarangays((list) => (on ? list.filter((x) => x !== b) : [...list, b]))}
                              >
                                {b}
                              </SelectChip>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-agap-track pt-3">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setBarangays((list) => Array.from(new Set([...list, ...FLOOD_PRONE_BARANGAYS])))}
                          >
                            <Droplets size={13} aria-hidden /> Add flood-prone (Lolomboy, Bunlo, Igulot, Bambang)
                          </Button>
                          {barangays.length > 0 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => setBarangays([])}>
                              <X size={13} aria-hidden /> Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </fieldset>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="issuer" className={labelCls}>Issued by<RequiredMark /></label>
                      <select
                        id="issuer"
                        aria-required
                        value={state.issuer}
                        onChange={(e) => setState((s) => ({ ...s, issuer: e.target.value as IssuerKey }))}
                        className={cn(inputCls, 'cursor-pointer')}
                      >
                        <option value="MAYOR">Office of the Mayor</option>
                        <option value="MAYOR_MDRRMO">Office of the Mayor + MDRRMO</option>
                        <option value="MDRRMO">MDRRMO</option>
                        <option value="OTHER">Other office…</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="lang" className={labelCls}>Language</label>
                      <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as LanguageMode)} className={cn(inputCls, 'cursor-pointer')}>
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
                        {checks.find((c) => c.label.startsWith('Verified source')) && <RequiredMark />}
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
                    <img src={shownImage} alt={imageAlt || 'Selected announcement image'} className="h-36 w-full rounded-xl border border-agap-track object-cover sm:w-56" />
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
                      {imageFile && <p className="truncate text-xs text-agap-hint">{imageFile.name} · uploads when you save</p>}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                      'flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-agap-fieldBorder bg-agap-pearl px-4 py-7',
                      'text-sm font-semibold text-agap-textMid hover:border-agap-green hover:bg-agap-greenSoft hover:text-agap-green motion-safe:transition-colors',
                      focusRing,
                    )}
                  >
                    <ImagePlus size={20} aria-hidden />
                    Attach an image
                    <span className="text-xs font-normal text-agap-hint">JPEG, PNG or WebP · up to 5 MB</span>
                  </button>
                )}
                {existingImage.isError && !imagePreview && (
                  <p className="mt-2 text-xs text-agap-amberText">The saved image could not be loaded from storage.</p>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickImage} />
              </Section>

              <Section
                step={5}
                title="Review the text"
                hint={state.manual ? 'Editing by hand — field changes above no longer update the text.' : 'Updates live as you change the fields above.'}
                aside={
                  state.manual ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-agap-amberSoft px-2 py-1 text-[11px] font-bold text-agap-amberText">
                      <PencilLine size={12} aria-hidden /> Edited by hand
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-agap-greenSoft px-2 py-1 text-[11px] font-bold text-agap-green">
                      <Sparkles size={12} aria-hidden /> Auto-written
                    </span>
                  )
                }
              >
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
                    <dl className="divide-y divide-agap-track rounded-xl border border-agap-track bg-agap-pearl">
                      <div className="px-4 py-3">
                        <dt className="text-xs font-semibold text-agap-hint">Headline</dt>
                        <dd className="mt-0.5 text-sm font-bold text-agap-textMain">{text.title || <span className="font-normal italic text-agap-hint">Fill the required details to generate it</span>}</dd>
                      </div>
                      <div className="px-4 py-3">
                        <dt className="text-xs font-semibold text-agap-hint">Summary</dt>
                        <dd className="mt-0.5 text-sm text-agap-textMid">{text.summary || '—'}</dd>
                      </div>
                    </dl>
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
            <div className="space-y-4 rounded-2xl border border-agap-track bg-white p-4 shadow-card">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span id="severity-label" className="text-xs font-semibold text-agap-textMid">Severity</span>
                  {suggested && state.severityTouched && suggested !== severity && (
                    <button
                      type="button"
                      onClick={() => { setState((s) => ({ ...s, severityTouched: false })); setSeverity(suggested); }}
                      className={cn('inline-flex items-center gap-1 rounded text-xs font-semibold text-agap-green hover:underline', focusRing)}
                    >
                      <Sparkles size={12} aria-hidden /> Use suggested: {severityMeta(suggested).label}
                    </button>
                  )}
                </div>
                <div role="radiogroup" aria-labelledby="severity-label" className="grid grid-cols-2 gap-2">
                  {SEVERITIES.map((s) => {
                    const m = severityMeta(s);
                    const SevIcon = m.icon;
                    const on = severity === s;
                    const auto = suggested === s && !state.severityTouched;
                    return (
                      <label
                        key={s}
                        className={cn(
                          'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2',
                          'motion-safe:transition-colors focus-within:ring-2 focus-within:ring-agap-green focus-within:ring-offset-1',
                          on ? cn(m.soft, m.ring, 'border-2') : 'border-agap-fieldBorder bg-white hover:border-agap-textMid',
                        )}
                      >
                        <input
                          type="radio"
                          name="severity"
                          value={s}
                          checked={on}
                          onChange={() => { setSeverity(s); setState((st) => ({ ...st, severityTouched: true })); }}
                          className="sr-only"
                        />
                        <SevIcon size={16} className={cn('shrink-0', m.text)} aria-hidden />
                        <span className="min-w-0 leading-tight">
                          <span className={cn('block text-xs font-bold', on ? m.text : 'text-agap-textMain')}>{m.label}</span>
                          <span className="block text-[11px] text-agap-hint">{m.priority}</span>
                        </span>
                        {auto && (
                          <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-agap-green ring-1 ring-agap-green/40">
                            Auto
                          </span>
                        )}
                        {on && !auto && <Check size={14} className={cn('ml-auto shrink-0', m.text)} aria-hidden />}
                      </label>
                    );
                  })}
                </div>
                {severity === 'CRITICAL' && (
                  <p className="mt-2 text-xs leading-snug text-agap-hint">
                    Critical notices are pinned at the top of the citizen app.
                    {needsApproval && ' An MDRRMO Supervisor approves them before release.'}
                  </p>
                )}
              </div>

              {checks.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-agap-textMid">Ready to publish</span>
                    <span className={cn('font-bold tabular-nums', checksDone === checks.length ? 'text-agap-green' : 'text-agap-amberText')}>
                      {checksDone} of {checks.length}
                    </span>
                  </div>
                  <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-agap-surface" aria-hidden>
                    <div
                      className={cn(
                        'h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300',
                        checksDone === checks.length ? 'bg-agap-green' : 'bg-agap-amber',
                      )}
                      style={{ width: `${Math.round((checksDone / checks.length) * 100)}%` }}
                    />
                  </div>
                  <ul className="space-y-1.5">
                    {checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-2 text-xs">
                        {c.ok
                          ? <Check size={14} className="mt-px shrink-0 text-agap-green" aria-label="Done" />
                          : <CircleAlert size={14} className="mt-px shrink-0 text-agap-amberText" aria-label="Missing" />}
                        <span className={c.ok ? 'text-agap-hint' : 'font-semibold text-agap-textMain'}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-3 py-2 text-xs text-agap-danger">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <Button variant="secondary" className="flex-1" loading={busy && !confirming} onClick={onSaveDraft} disabled={busy || confirming}>
                  Save draft
                </Button>
                <Button variant="primary" className="flex-1" disabled={!ready || busy || confirming} onClick={onPublish}>
                  <Send size={14} /> {needsApproval ? 'Submit for MDRRMO approval' : <>Review &amp; publish</>}
                </Button>
              </div>
              <p className="text-xs leading-snug text-agap-hint">
                Nothing is sent until you approve it. Drafts are never visible to residents.
              </p>
            </div>
          )}
        </aside>
      </div>
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
