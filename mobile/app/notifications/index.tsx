import { PlaceholderScreen } from '../../src/components/ui/placeholder-screen';
import { useTranslations } from '../../src/hooks/useAccessibility';

// MOD-16 — Notifications (alerts & announcements)
export default function NotificationsScreen() {
  const t = useTranslations();
  return (
    <PlaceholderScreen
      title={t.profile.notifications}
      icon="notifications-outline"
      description={t.profile.notificationsSub}
    />
  );
}
