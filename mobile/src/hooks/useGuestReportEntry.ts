import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { fetchGuestReportStatus } from '@/src/services/api/guest-report.api';
import { guestReportStatusKey } from '@/src/components/guest-report/GuestReportStatusCard';
import { guestReportGate } from '@/src/services/guest-report/guest-report-gate';
import { clearSavedGuestReport, loadSavedGuestReport } from '@/src/services/guest-report/saved-guest-report';
import { useIncidentStore } from '@/src/stores/incident.store';

/**
 * "Report an emergency" without an account (Rule 14). If this phone's last guest report
 * is still being handled (or was just marked a false alert), open that report instead
 * of a new form the server would refuse. Any doubt goes straight to the form.
 */
export function useGuestReportEntry() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const beginGuestReport = useIncidentStore((s) => s.beginGuestReport);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const gate = await guestReportGate({
        load: () => loadSavedGuestReport(),
        clear: clearSavedGuestReport,
        // Fresh within 10 s is good enough; the status screen polls anyway.
        fetchStatus: (token) =>
          queryClient.fetchQuery({
            queryKey: guestReportStatusKey(token),
            queryFn: () => fetchGuestReportStatus(token),
            staleTime: 10_000,
            retry: false,
          }),
      });
      if (gate.kind === 'follow') {
        router.push('/emergency/guest-status' as never);
        return;
      }
      beginGuestReport();
      router.push('/emergency/location');
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }, [beginGuestReport, queryClient, router]);

  return { start, checking };
}
