'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { IncidentStatus } from '@agap/shared';

interface IncidentSummary {
  id: string;
  ticketNumber: string;
  type: string;
  priority: string;
  status: IncidentStatus;
  address: string | null;
  reportedAt: string;
}

export default function IncidentsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => api.get<{ data: IncidentSummary[] }>('/incidents'),
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="p-6 text-slate-400">Loading incidents...</div>;
  if (error) return <div className="p-6 text-red-400">Failed to load incidents</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Incident Queue</h1>
      <div className="space-y-2">
        {data?.data.map((inc) => (
          <div key={inc.id} className="bg-slate-900 rounded border border-slate-800 p-4 flex items-center justify-between">
            <div>
              <span className="text-slate-400 text-sm font-mono">{inc.ticketNumber}</span>
              <span className="ml-3 font-medium text-white">{inc.type}</span>
              {inc.address && <span className="ml-2 text-slate-400 text-sm">{inc.address}</span>}
            </div>
            <div className="flex gap-3 items-center">
              <span className={`text-xs px-2 py-1 rounded font-mono priority-${inc.priority.toLowerCase()}`}>
                {inc.priority}
              </span>
              <span className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300">
                {inc.status}
              </span>
            </div>
          </div>
        ))}
        {data?.data.length === 0 && (
          <p className="text-slate-500">No active incidents</p>
        )}
      </div>
    </div>
  );
}
