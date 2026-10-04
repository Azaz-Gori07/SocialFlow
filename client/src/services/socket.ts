import { io, Socket } from 'socket.io-client';
import { isTokenExpiring, refreshAccessToken, hardLogout } from './token';

const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL as string | undefined;

// SOCKET_URL points at the dedicated persistent Socket.IO service (Render).
// Falls back to the REST API origin (local dev: same Express process serves
// both). Never point this at a serverless host — see guard below.
const SOCKET_URL = (import.meta.env.SOCKET_URL as string | undefined)
  || (backendApiUrl ? backendApiUrl.replace(/\/api\/?$/, '') : 'http://localhost:5000');

let socket: Socket | null = null;
// Middleware rejections are not auto-retried by socket.io — cap our own
// refresh-and-retry loop so a misbehaving server can't spin.
let authRecoveryTries = 0;
// Single handshake scheduler: a second connectSocket() call (React StrictMode
// double-invokes the auth effect) must not fire the handshake while a
// token refresh for the first call is still in flight — that race sent the
// stale token once and produced `Invalid or expired token`.
let pendingHandshake: Promise<void> | null = null;

function startHandshake(): void {
  if (!socket || pendingHandshake) return;

  const token = localStorage.getItem('access_token');
  if (isTokenExpiring(token)) {
    pendingHandshake = refreshAccessToken()
      .then((r) => {
        if (r.status === 'unauthorized') {
          hardLogout();
          return;
        }
        // 'ok' | 'network' | 'none': attempt anyway — transport errors are
        // covered by the reconnect policy, auth failures by connect_error.
        socket?.connect();
      })
      .finally(() => {
        pendingHandshake = null;
      });
  } else {
    socket.connect();
  }
}

/**
 * Initialize socket connection with auth token.
 * Should be called after user logs in.
 *
 * The handshake reads the token from localStorage at attempt time (auth
 * callback), so tokens rotated by api.ts refreshes are picked up on any
 * reconnect. An expired stored token is rotated BEFORE the first handshake,
 * which is what used to produce `Invalid or expired token` console errors.
 */
export function connectSocket(token?: string): Socket | null {
  const initial = token || localStorage.getItem('access_token');
  if (!initial) {
    return null;
  }
  // Safety net: if no SOCKET_URL was configured and the fallback resolved to
  // a serverless host, connecting would only produce 404 + endless reconnect
  // errors — degrade to REST polling instead.
  if (SOCKET_URL.includes('.vercel.app')) {
    console.warn('⚠️ No SOCKET_URL configured; real-time disabled (REST fallback only).');
    return null;
  }

  if (socket) {
    if (!socket.connected) {
      startHandshake();
    }
    return socket;
  }

  authRecoveryTries = 0;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    // Fresh credential on EVERY connection attempt — no stale socket.auth.
    auth: (cb) => cb({ token: localStorage.getItem('access_token') || '' }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    authRecoveryTries = 0;
    console.log('🔌 Socket.IO connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.IO disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('🔌 Socket.IO connection error:', error.message);

    // The server rejected our credential (expired/revoked). Rotate the token
    // once via the shared single-flight refresh and re-handshake; if the
    // refresh token itself is dead, drop to login instead of retrying.
    if (/token/i.test(error.message) && authRecoveryTries < 2) {
      authRecoveryTries += 1;
      void refreshAccessToken().then((r) => {
        if (r.status === 'ok') {
          socket?.connect();
        } else if (r.status === 'unauthorized') {
          disconnectSocket();
          hardLogout();
        }
        // 'network' / 'none': stop — REST fallback covers the app.
      });
    }
  });

  // Rotate-before-handshake if the stored token is expired (see startHandshake).
  startHandshake();

  return socket;
}

/**
 * Get the current socket instance.
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect the socket.
 * Should be called on logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Listen for real-time notifications.
 */
export function onNotification(callback: (notification: any) => void): () => void {
  if (!socket) {
    console.warn('Socket not connected. Cannot listen for notifications.');
    return () => {};
  }

  socket.on('notification', callback);
  return () => {
    socket?.off('notification', callback);
  };
}

/**
 * Listen for unread count updates.
 */
export function onUnreadCount(callback: (data: { count: number }) => void): () => void {
  if (!socket) {
    console.warn('Socket not connected. Cannot listen for unread count.');
    return () => {};
  }

  socket.on('notifications:unread_count', callback);
  return () => {
    socket?.off('notifications:unread_count', callback);
  };
}
