'use client';

import type { JSX } from 'react';
import { AuditTrail } from '@/components/audit/AuditTrail';

/** The Supervisor's Activity Log. The System Administrator reads the same trail under Logs. */
export default function AuditPage(): JSX.Element {
  return <AuditTrail />;
}
