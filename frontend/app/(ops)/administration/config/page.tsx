import { redirect } from 'next/navigation';

/** Configuration is now the first tab of Settings. */
export default function Redirect(): never {
  redirect('/administration/settings');
}
