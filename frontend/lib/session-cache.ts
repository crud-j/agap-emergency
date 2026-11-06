import { getSessionUser, subscribeSession } from './auth';

/**
 * Nothing cached outlives the account it belongs to (shared Operations Center computers). Query
 * keys aren't per account, and not every sign-out reloads the page, so this follows the session
 * itself: signing out, or another account signing in, empties the cache. A token refresh or an
 * unlock keeps the same account and keeps the cache, so a dispatcher's screens never blank out.
 * Returns an unsubscribe function.
 */
export function clearCacheWhenAccountChanges(cache: { clear(): void }): () => void {
  let account = getSessionUser()?.id ?? null;
  return subscribeSession(() => {
    const next = getSessionUser()?.id ?? null;
    if (account !== null && next !== account) cache.clear();
    account = next;
  });
}
