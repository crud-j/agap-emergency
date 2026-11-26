import { redirect } from 'next/navigation';

/** Security Events is now a tab of Logs. */
export default function Redirect(): never {
  redirect('/administration/logs?tab=security');
}
