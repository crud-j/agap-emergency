import type { ReactElement } from 'react';

export default function Page(): ReactElement {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-4">Hospital Coordination</h1>
      <p className="text-slate-500">Hospital receiving requests pending</p>
    </div>
  );
}

