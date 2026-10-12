
'use client';
import type React from 'react';
import { useActivityStream } from '@/hooks/use-activity-stream';
import { useWsState } from '@/lib/use-ws-state';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function ActivityStream(): React.JSX.Element {
  const items = useActivityStream();
  const wsState = useWsState();

  const connectionLabel = {
    connected: 'Connected',
    connecting: 'Connecting',
    offline: 'Offline',
  }[wsState];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Recent operational events received from AGAP.
            </CardDescription>
          </div>

          <Badge
           variant={wsState === 'connected' ? 'green' : 'muted'}
          >
            {connectionLabel}
          </Badge>
        </div>
      </CardHeader>

      <div className="space-y-3 px-6 pb-6">
        {items.length === 0 ? (
          <EmptyState
            title="No recent activity"
            description={
              wsState === 'connected'
                ? 'New events will appear here when received.'
                : 'Activity will appear when the connection is available.'
            }
          />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {item.event}
                </p>

                <time
                  dateTime={item.timestamp}
                  className="text-xs text-slate-500"
                >
                  {formatTimestamp(item.timestamp)}
                </time>
              </div>

              <p className="mt-1 text-sm text-slate-900">
                {item.message}
              </p>

              {item.incidentId && (
                <p className="mt-2 text-xs text-slate-500">
                  Incident ID: {item.incidentId}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
