import { fetchAnalyticsExport, type AnalyticsExportDataset, type AnalyticsRange } from './api';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in Asia/Manila (UTC+8, no daylight saving), matching the server's file name. */
export function manilaDateKey(iso: string): string {
  return new Date(new Date(iso).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

const FILE_PREFIX: Record<AnalyticsExportDataset, string> = {
  summary: 'AGAP-Analytics-Summary',
  incidents: 'AGAP-Incident-List',
};

/** e.g. AGAP-Incident-List_2026-10-15_to_2026-11-14.csv (same name the server sends). */
export function analyticsExportFilename(dataset: AnalyticsExportDataset, range: AnalyticsRange): string {
  return `${FILE_PREFIX[dataset]}_${manilaDateKey(range.from)}_to_${manilaDateKey(range.to)}.csv`;
}

/** Fetch the CSV for the page's current range and save it in the browser. */
export async function downloadAnalyticsCsv(dataset: AnalyticsExportDataset, range: AnalyticsRange): Promise<void> {
  const blob = await fetchAnalyticsExport(dataset, range);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = analyticsExportFilename(dataset, range);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Let the click start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
