import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// MOD-03 — Medical Profile (sensitive; requires consent before access)
export default function MedicalScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.medicalProfile}
      icon="pulse-outline"
      description={t.profile.medicalProfileSub}
    />
  );
}
