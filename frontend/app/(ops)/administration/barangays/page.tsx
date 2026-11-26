import type { JSX } from 'react';
import { Landmark } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminSections';
import { BarangayDirectoryTab } from '@/components/admin/BarangayDirectoryTab';

export default function AdminBarangaysPage(): JSX.Element {
  return (
    <AdminPage
      title="Barangay Directory"
      icon={<Landmark />}
      description="The phone numbers that get a text when an incident happens in their barangay, with a backup number for each."
    >
      <BarangayDirectoryTab />
    </AdminPage>
  );
}
