import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { RequestsInbox } from '@/components/resources/RequestsInbox';

export default function ResourceRequestsPage(): JSX.Element {
  return (
    <AdminPage title="Requests" description="MOD-35 · Mutual-aid requests your organization can answer">
      <RequestsInbox />
    </AdminPage>
  );
}
