'use client';

import type { JSX } from 'react';
import { ResponseTargets } from '@/components/sla/ResponseTargets';

/** The Supervisor's Response Targets page. The System Administrator edits the same targets under Settings. */
export default function SlaTargetsPage(): JSX.Element {
  return <ResponseTargets />;
}
