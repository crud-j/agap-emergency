import type { JSX } from 'react';
import { AdminPage } from '@/components/admin/AdminSections';
import { BarangayDirectoryTab } from '@/components/admin/BarangayDirectoryTab';

export default function AdminBarangaysPage(): JSX.Element {
  return (
    <AdminPage title="Barangay Directory" description="Primary and backup numbers for barangay alerts">
      <BarangayDirectoryTab />
    </AdminPage>
  );
}
