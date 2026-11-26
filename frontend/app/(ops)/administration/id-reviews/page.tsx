import type { JSX } from 'react';
import { IdCard } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminSections';
import { IdCardRelease } from '@/components/admin/IdCardRelease';
import { IdReviewQueue } from '@/components/admin/IdReviewQueue';

export default function AdminIdReviewsPage(): JSX.Element {
  return (
    <AdminPage
      title="ID Reviews"
      icon={<IdCard />}
      module="MOD-01"
      description="PhilHealth and National IDs that citizens sent at sign-up. Open one, check it, then approve or reject it."
    >
      <div className="space-y-6">
        <IdReviewQueue />
        <IdCardRelease />
      </div>
    </AdminPage>
  );
}
