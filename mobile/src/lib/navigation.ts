import { router } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { homeRouteForRole } from './role-routing';

/**
 * Back, or somewhere sensible when there is no screen to go back to.
 *
 * A screen can be the only one in the stack: opened from a push notification or a
 * deep link, or restored after a Metro reload (dev-route-restore). A bare
 * `router.back()` there throws "The action 'GO_BACK' was not handled by any
 * navigator" and the button does nothing.
 *
 * Without a `fallback`, it goes to the signed-in user's home, or to login.
 */
export function goBack(fallback?: string): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const { isAuthenticated, user } = useAuthStore.getState();
  const to = fallback ?? (isAuthenticated ? homeRouteForRole(user?.role) : '/auth/login');
  router.replace(to as never);
}
