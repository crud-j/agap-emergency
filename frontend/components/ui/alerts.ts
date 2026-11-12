'use client';

/**
 * SweetAlert2 confirmations and notifications in the AGAP look.
 *
 * - sweetalert2 is loaded on first use (client only), so it never runs during SSR.
 * - Swal's `title` and `html` render as HTML. Plain text goes in `titleText` / `text`;
 *   anything built into `html` must pass through `escapeHtml` first (unit names,
 *   crew names and notes come from the database).
 * - Swal shows one popup at a time. A toast never replaces an open confirmation.
 * - Opening one over a Radix drawer or dialog: pass that element as `target`. Radix
 *   modals block pointer events and pull focus back from anything outside them, so
 *   a popup mounted on <body> would not be clickable or keyboard-usable there.
 */
import type { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

type Swal = typeof import('sweetalert2').default;

let swalPromise: Promise<Swal> | null = null;
function loadSwal(): Promise<Swal> {
  swalPromise ??= import('sweetalert2').then((m) => m.default);
  return swalPromise;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function motion(): Pick<SweetAlertOptions, 'showClass' | 'hideClass'> {
  return reducedMotion() ? { showClass: { popup: '' }, hideClass: { popup: '' } } : {};
}

const BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

const CONFIRM_TONE = {
  primary: 'bg-agap-green text-white hover:bg-[#0A4F44] focus-visible:ring-agap-green',
  danger: 'bg-agap-danger text-white hover:bg-agap-dangerDeep focus-visible:ring-agap-danger',
} as const;

// Above the top bar (1100), drawers (1200) and dialogs (1310); Swal's own 1060 would sit under them.
const CONTAINER = '!z-[1350]';

const MODAL_CLASSES: SweetAlertOptions['customClass'] = {
  container: CONTAINER,
  popup: '!rounded-2xl !p-6 !font-sans !shadow-card-md',
  title: '!px-0 !pt-2 !text-[18px] !font-bold !text-agap-textMain',
  htmlContainer: '!mx-0 !mt-3 !px-0 !text-left !text-[14px] !leading-relaxed !text-agap-textMid',
  actions: '!mt-6 !w-full !justify-end gap-2',
  cancelButton: `${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400`,
  validationMessage: '!mx-0 !mt-4 !justify-start !rounded-lg !bg-agap-dangerSoft !px-3 !py-2 !text-left !text-[13px] !text-agap-danger',
  loader: '!border-agap-green !border-r-transparent',
};

/** True while a confirmation or message (not a toast) is on screen. */
export function isModalAlertOpen(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('.swal2-container .swal2-popup:not(.swal2-toast)');
}

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.';
}

export interface ConfirmOptions {
  /** Plain text. */
  title: string;
  /** Plain text body. Use `html` instead for a formatted summary. */
  text?: string;
  /** Pre-escaped HTML body (build it with `escapeHtml`). */
  html?: string;
  confirmText: string;
  cancelText?: string;
  tone?: keyof typeof CONFIRM_TONE;
  icon?: SweetAlertIcon;
  /**
   * Runs the action inside the popup: the confirm button shows a spinner, and a
   * failure is shown in the popup (which stays open to retry or cancel) instead of
   * closing it. Resolves true only once this has succeeded.
   */
  onConfirm?: () => Promise<unknown>;
  /** Element to mount the popup in — the open drawer/dialog's content (see top). */
  target?: HTMLElement | null;
}

/**
 * Resolves once the popup has fully closed. When it is mounted inside a drawer, the
 * caller may close that drawer next, and removing the popup mid-animation would leave
 * SweetAlert2 waiting for an animation end that never comes.
 */
function closedSignal(): { didClose: () => void; whenClosed: Promise<void> } {
  let didClose!: () => void;
  const whenClosed = new Promise<void>((resolve) => { didClose = resolve; });
  return { didClose, whenClosed };
}

/** Ask before a consequential action. Resolves true only on an explicit confirm. */
export async function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const Swal = await loadSwal();
  const { didClose, whenClosed } = closedSignal();
  const run = opts.onConfirm;
  const result = await Swal.fire({
    titleText: opts.title,
    ...(opts.html !== undefined ? { html: opts.html } : opts.text !== undefined ? { text: opts.text } : {}),
    icon: opts.icon ?? 'question',
    iconColor: opts.tone === 'danger' ? '#CF3B4E' : '#0D6053',
    showCancelButton: true,
    confirmButtonText: escapeHtml(opts.confirmText),
    cancelButtonText: escapeHtml(opts.cancelText ?? 'Cancel'),
    buttonsStyling: false,
    reverseButtons: true,
    focusConfirm: true,
    allowEscapeKey: run ? () => !Swal.isLoading() : true,
    allowOutsideClick: run ? () => !Swal.isLoading() : true,
    ...(opts.target ? { target: opts.target } : {}),
    ...(run
      ? {
          showLoaderOnConfirm: true,
          preConfirm: async () => {
            try {
              await run();
              return true;
            } catch (e) {
              Swal.showValidationMessage(escapeHtml(errorText(e)));
              return false;
            }
          },
        }
      : {}),
    customClass: { ...MODAL_CLASSES, confirmButton: `${BTN} ${CONFIRM_TONE[opts.tone ?? 'primary']}` },
    didClose,
    ...motion(),
  });
  if (opts.target) await whenClosed;
  return result.isConfirmed;
}

/** A blocking message the user must read (a failed or partial action). */
export async function alertMessage(opts: {
  title: string;
  text?: string;
  /** Pre-escaped HTML body (build it with `escapeHtml`). */
  html?: string;
  icon: 'error' | 'warning' | 'success' | 'info';
  target?: HTMLElement | null;
}): Promise<void> {
  const Swal = await loadSwal();
  const { didClose, whenClosed } = closedSignal();
  await Swal.fire({
    titleText: opts.title,
    ...(opts.html !== undefined ? { html: opts.html } : { text: opts.text ?? '' }),
    icon: opts.icon,
    confirmButtonText: 'OK',
    buttonsStyling: false,
    ...(opts.target ? { target: opts.target } : {}),
    customClass: { ...MODAL_CLASSES, confirmButton: `${BTN} ${CONFIRM_TONE[opts.icon === 'error' ? 'danger' : 'primary']}` },
    didClose,
    ...motion(),
  });
  if (opts.target) await whenClosed;
}

export interface NotifyOptions {
  title: string;
  text?: string;
  /** Show a button on the toast; resolves true when it is pressed. */
  actionText?: string;
  /** Milliseconds before it hides; default 5000 (8000 with an action). */
  timer?: number;
}

/**
 * Corner toast. Never interrupts: if a confirmation or message is open, the toast
 * is skipped (resolves false), because Swal would otherwise close that dialog.
 */
export async function notify(kind: 'success' | 'error' | 'warning' | 'info', opts: NotifyOptions): Promise<boolean> {
  const Swal = await loadSwal();
  if (Swal.isVisible() && !Swal.getPopup()?.classList.contains('swal2-toast')) return false;
  const result = await Swal.fire({
    toast: true,
    position: 'top-end',
    icon: kind,
    titleText: opts.title,
    ...(opts.text ? { text: opts.text } : {}),
    showConfirmButton: !!opts.actionText,
    ...(opts.actionText ? { confirmButtonText: escapeHtml(opts.actionText) } : {}),
    buttonsStyling: false,
    timer: opts.timer ?? (opts.actionText ? 8000 : 5000),
    timerProgressBar: !reducedMotion(),
    customClass: {
      container: CONTAINER,
      popup: '!rounded-xl !font-sans !shadow-card-md',
      title: '!text-[14px] !font-bold !text-agap-textMain',
      htmlContainer: '!text-[13px] !text-agap-textMid',
      confirmButton: `${BTN} !min-h-9 !px-3 !text-[13px] ${CONFIRM_TONE.primary}`,
    },
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    },
    ...motion(),
  });
  return result.isConfirmed;
}
