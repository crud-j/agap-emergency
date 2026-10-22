import { redirect } from 'next/navigation';

/** The Registry is now a tab of Fleet & Units. */
export default function ResourcesPage(): never {
  redirect('/operations/fleet?tab=registry');
}
