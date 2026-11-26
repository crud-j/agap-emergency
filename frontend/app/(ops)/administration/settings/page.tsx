'use client';

import { Suspense, type JSX } from 'react';
import { Settings2, SlidersHorizontal, Table2, Timer } from 'lucide-react';
import { AdminPage, ConfigTab } from '@/components/admin/AdminSections';
import { AdminTabs, type AdminTab } from '@/components/admin/AdminTabs';
import { AccessMatrix } from '@/components/admin/AccessMatrix';
import { ResponseTargets } from '@/components/sla/ResponseTargets';

type SettingsTab = 'config' | 'targets' | 'access';

const TABS: readonly AdminTab<SettingsTab>[] = [
  {
    key: 'config',
    label: 'Configuration',
    icon: Settings2,
    hint: 'System values the server reads, such as timers and feature switches. "In use" means the code reads it.',
  },
  {
    key: 'targets',
    label: 'Response targets',
    icon: Timer,
    hint: 'How fast the Operations Center should acknowledge, dispatch and reach the scene. A missed target alerts a Supervisor.',
  },
  {
    key: 'access',
    label: 'Page access',
    icon: Table2,
    hint: 'Which staff role can open which page of this console.',
  },
];

/**
 * System Administrator Settings (MOD-49 / MOD-41 / MOD-47): configuration, response targets and
 * the read-only page-access table. /administration/config and /administration/permissions
 * redirect here.
 */
export default function AdminSettingsPage(): JSX.Element {
  return (
    <AdminPage
      title="Settings"
      icon={<SlidersHorizontal />}
      module="MOD-49"
      description="How AGAP behaves: system values, response time targets, and who can open what."
    >
      <Suspense fallback={null}>
        <AdminTabs tabs={TABS} label="Settings section">
          {(tab) =>
            tab === 'config' ? <ConfigTab />
              : tab === 'targets' ? <ResponseTargets embedded />
                : <AccessMatrix />}
        </AdminTabs>
      </Suspense>
    </AdminPage>
  );
}
