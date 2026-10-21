import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  reportReadiness,
  type ReadinessCheck,
  type ReadinessResult,
  type ReadinessStatus,
} from '../services/api/readiness.api';
import {
  collectDeviceReadiness,
  getDeviceId,
  toReportDto,
  toSnapshot,
  type DeviceReadiness,
} from '../services/readiness/device-readiness';
import {
  ACCOUNT_CHECK_IDS,
  evaluateDeviceChecks,
  overallStatus,
  sortChecks,
} from '../services/readiness/readiness-rules';

export type SyncState = 'synced' | 'offline' | 'unreachable';

export interface ReadinessView {
  device: DeviceReadiness;
  checks: ReadinessCheck[];
  overall: ReadinessStatus;
  passed: number;
  total: number;
  sync: SyncState;
  /** Last time the server evaluated this device, even if the latest sync failed. */
  syncedAt: string | null;
  /** False when account checks (contacts, phone, medical) have never been fetched. */
  accountKnown: boolean;
  lastServer: ReadinessResult | null;
}

export const READINESS_QUERY_KEY = ['readiness'] as const;

function buildOfflineView(
  device: DeviceReadiness,
  sync: Exclude<SyncState, 'synced'>,
  lastServer: ReadinessResult | null,
): ReadinessView {
  const deviceChecks = evaluateDeviceChecks(toSnapshot(device)).map((check) =>
    sync === 'unreachable' && check.id === 'connectivity' && check.status === 'READY'
      ? { ...check, status: 'LIMITED' as const, reason: 'SERVER_UNREACHABLE' }
      : check,
  );
  const accountChecks = lastServer?.checks.filter((check) => ACCOUNT_CHECK_IDS.includes(check.id)) ?? [];
  const checks = sortChecks([...deviceChecks, ...accountChecks]);
  return {
    device,
    checks,
    overall: overallStatus(checks),
    passed: checks.filter((check) => check.status === 'READY').length,
    total: checks.length,
    sync,
    syncedAt: lastServer?.syncedAt ?? null,
    accountKnown: !!lastServer,
    lastServer,
  };
}

/**
 * Runs the MOD-05 readiness check: probes the device, reports it to the server for the
 * authoritative evaluation, and falls back to a device-only evaluation when offline.
 */
export function useReadiness() {
  const qc = useQueryClient();

  return useQuery({
    queryKey: READINESS_QUERY_KEY,
    queryFn: async (): Promise<ReadinessView> => {
      const previous = qc.getQueryData<ReadinessView>(READINESS_QUERY_KEY);
      const lastServer = previous?.lastServer ?? null;
      const device = await collectDeviceReadiness();

      if (device.connectivity === 'OFFLINE') return buildOfflineView(device, 'offline', lastServer);

      try {
        const server = await reportReadiness(toReportDto(device, await getDeviceId()));
        return {
          device,
          checks: server.checks,
          overall: server.overallStatus ?? overallStatus(server.checks),
          passed: server.passed,
          total: server.total,
          sync: 'synced',
          syncedAt: server.syncedAt,
          accountKnown: true,
          lastServer: server,
        };
      } catch {
        return buildOfflineView(device, 'unreachable', lastServer);
      }
    },
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
