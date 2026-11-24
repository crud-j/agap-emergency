import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { SmsActivity } from '@/components/admin/SmsActivity';

export default function AdminSmsPage(): JSX.Element {
  return (
    <AdminPage title="SMS Activity" description="MOD-17 · Every outbound SMS through the Textbee gateway, from the server's SMS log">
      <SmsActivity />
    </AdminPage>
  );
}
