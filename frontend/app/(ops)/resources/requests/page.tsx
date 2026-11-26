import type { JSX } from 'react';
import { Inbox } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminSections';
import { RequestsInbox } from '@/components/resources/RequestsInbox';

export default function ResourceRequestsPage(): JSX.Element {
  return (
    <AdminPage
      title="Requests"
      icon={<Inbox />}
      module="MOD-35"
      description="Requests from other agencies for your organization's units or supplies. Approve or decline each one."
    >
      <RequestsInbox />
    </AdminPage>
  );
}
