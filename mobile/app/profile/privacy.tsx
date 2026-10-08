import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// MOD-48 — Privacy, Consent and Medical Data Protection
export default function PrivacyScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.privacy}
      icon="lock-closed-outline"
      description={t.profile.privacySub}
    />
  );
}
