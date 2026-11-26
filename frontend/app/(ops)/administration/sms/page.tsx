import { redirect } from 'next/navigation';

/** SMS Activity is now a tab of Logs. */
export default function Redirect(): never {
  redirect('/administration/logs?tab=sms');
}
