import { redirect } from 'next/navigation';

/** The administration tabs are now routes (/administration/<section>); system health is on the Dashboard. */
export default function AdministrationPage(): never {
  redirect('/dashboard');
}
