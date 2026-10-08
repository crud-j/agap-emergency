/**
 * Reads the dispatcher's JWT from the `agap_token` cookie (set at login). Used to
 * authorize REST calls and the WebSocket handshake from client components.
 */
export function getToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)agap_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

export function clearToken(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'agap_token=; path=/; max-age=0; samesite=strict';
}
