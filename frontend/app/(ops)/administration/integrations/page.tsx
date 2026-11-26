import { redirect } from 'next/navigation';

/** Integrations moved onto the System Administrator dashboard (System health). */
export default function Redirect(): never {
  redirect('/dashboard');
}
