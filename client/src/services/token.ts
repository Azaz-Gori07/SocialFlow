// Shared access-token expiry checks and single-flight refresh.
// Used by both api.ts (proactive refresh before fetch) and socket.ts
// (refresh before handshake), so parallel callers share ONE refresh
// request instead of stampeding /auth/refresh on every 401.
//
// No imports besides env — keeps api.ts <-> socket.ts free of cycles.

const API_BASE = (import.meta.env.VITE_BACKEND_API_URL as string | undefined)?.replace(/\/$/, '');

export type RefreshResult =
  | { status: 'ok'; token: string }
  | { status: 'unauthorized' } // refresh token rejected — session is dead
  | { status: 'network' }      // could not reach the server — keep session
  | { status: 'none' };        // nothing to refresh with

/** Read `exp` from a JWT payload without verifying it (client-side hint only). */
export function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True when the token is expired or within `skewSec` of expiry. Unparsable = expiring. */
export function isTokenExpiring(token: string | null, skewSec = 30): boolean {
  if (!token) return true;
  const exp = decodeJwtExp(token);
  if (exp === null) return true;
  return exp * 1000 - skewSec * 1000 < Date.now();
}

let inflight: Promise<RefreshResult> | null = null;

/**
 * Exchange the stored refresh token for a fresh access token.
 * Single-flight: concurrent callers await the same request. The result is
 * written straight to localStorage so every consumer (fetch, socket, future
 * reconnects) sees the rotated pair.
 */
export function refreshAccessToken(): Promise<RefreshResult> {
  if (inflight) return inflight;

  inflight = (async (): Promise<RefreshResult> => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken || !API_BASE) return { status: 'none' };

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        if (data?.accessToken) {
          localStorage.setItem('access_token', data.accessToken);
          if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
          return { status: 'ok', token: data.accessToken };
        }
        return { status: 'network' };
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'unauthorized' };
      }
      return { status: 'network' };
    } catch {
      return { status: 'network' };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** The session is gone: clear credentials and tell the app to drop to login. */
export function hardLogout(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth-logout'));
}
