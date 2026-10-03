import { io, Socket } from 'socket.io-client';

const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL as string | undefined;

// SOCKET_URL points at the dedicated persistent Socket.IO service (Render).
// Falls back to the REST API origin (local dev: same Express process serves
// both). Never point this at a serverless host — see guard below.
const SOCKET_URL = (import.meta.env.SOCKET_URL as string | undefined)
  || (backendApiUrl ? backendApiUrl.replace(/\/api\/?$/, '') : 'http://localhost:5000');

let socket: Socket | null = null;

/**
 * Initialize socket connection with auth token.
 * Should be called after user logs in.
 */
export function connectSocket(token?: string): Socket | null {
  const currentToken = token || localStorage.getItem('access_token');
  if (!currentToken) {
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
    socket.auth = { token: currentToken };
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token: currentToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket.IO connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.IO disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('🔌 Socket.IO connection error:', error.message);
  });

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