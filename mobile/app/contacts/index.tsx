import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// MOD-02 — Emergency Contact Management
export default function ContactsScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.emergencyContacts}
      icon="people-outline"
      description={t.profile.emergencyContactsSub}
    />
  );
}
