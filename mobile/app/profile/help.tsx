import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// Help & Support
export default function HelpScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.help}
      icon="help-circle-outline"
      description={t.profile.helpSub}
    />
  );
}
