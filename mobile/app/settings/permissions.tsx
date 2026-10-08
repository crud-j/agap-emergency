import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// MOD-05 — Emergency Readiness and Permission Status
export default function PermissionsScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.readiness}
      icon="shield-checkmark-outline"
      description={t.profile.readinessSub}
    />
  );
}
