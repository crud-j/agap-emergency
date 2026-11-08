import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { IdCardRelease } from '@/components/admin/IdCardRelease';
import { IdReviewQueue } from '@/components/admin/IdReviewQueue';

export default function AdminIdReviewsPage(): JSX.Element {
  return (
    <AdminPage title="ID Reviews" description="MOD-01 · PhilHealth IDs and National IDs that citizens sent to MDRRMO at registration">
      <div className="space-y-6">
        <IdReviewQueue />
        <IdCardRelease />
      </div>
    </AdminPage>
  );
}
