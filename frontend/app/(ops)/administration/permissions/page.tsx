import { redirect } from 'next/navigation';

/** Roles & Permissions became the read-only Page access tab of Settings. */
export default function Redirect(): never {
  redirect('/administration/settings?tab=access');
}
