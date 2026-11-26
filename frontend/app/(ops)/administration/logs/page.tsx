'use client';

import { Suspense, type JSX } from 'react';
import { MessageSquareText, ScrollText, ShieldAlert, UserRoundPen } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminSections';
import { AdminTabs, type AdminTab } from '@/components/admin/AdminTabs';
import { AuditTrail } from '@/components/audit/AuditTrail';
import { SecurityEvents } from '@/components/admin/SecurityEvents';
import { SmsActivity } from '@/components/admin/SmsActivity';

type LogTab = 'activity' | 'security' | 'sms';

const TABS: readonly AdminTab<LogTab>[] = [
  {
    key: 'activity',
    label: 'Activity',
    icon: UserRoundPen,
    hint: 'Every recorded action by staff and the system. Click a row for the full read-only entry.',
  },
  {
    key: 'security',
    label: 'Security events',
    icon: ShieldAlert,
    hint: 'Failed sign-ins, lockouts, account security changes and guest reports, with the address they came from.',
  },
  {
    key: 'sms',
    label: 'SMS',
    icon: MessageSquareText,
    hint: 'Every text the server sent through the Textbee gateway: ops alerts, barangay alerts, replies and codes.',
  },
];

/**
 * System Administrator Logs (MOD-46 / MOD-17): the audit trail, security events and the SMS
 * log behind one link. /administration/security and /administration/sms redirect here.
 */
export default function AdminLogsPage(): JSX.Element {
  return (
    <AdminPage
      title="Logs"
      icon={<ScrollText />}
      module="MOD-46"
      description="What happened in AGAP and who did it. These records can't be edited or deleted."
    >
      {/* useSearchParams (the ?tab= value) needs a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <AdminTabs tabs={TABS} label="Log type">
          {(tab) =>
            tab === 'activity' ? <AuditTrail embedded />
              : tab === 'security' ? <SecurityEvents />
                : <SmsActivity />}
        </AdminTabs>
      </Suspense>
    </AdminPage>
  );
}
