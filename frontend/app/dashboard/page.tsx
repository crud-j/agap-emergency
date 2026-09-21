export default function DashboardPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Operations Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Incidents" value="—" color="red" />
        <StatCard label="Responders On Scene" value="—" color="orange" />
        <StatCard label="Units Available" value="—" color="green" />
        <StatCard label="Pending Dispatch" value="—" color="yellow" />
      </div>
      <p className="text-slate-500 text-sm mt-8">
        Real-time data loads after WebSocket connection. Implementation pending.
      </p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const borderColors: Record<string, string> = {
    red: 'border-red-500',
    orange: 'border-orange-500',
    green: 'border-green-500',
    yellow: 'border-yellow-500',
  };
  return (
    <div className={`bg-slate-900 border-l-4 ${borderColors[color] ?? 'border-slate-500'} rounded p-4`}>
      <p className="text-slate-400 text-sm">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
