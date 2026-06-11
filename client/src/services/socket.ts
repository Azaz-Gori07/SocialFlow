import { io, Socket } from 'socket.io-client';

const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL as string | undefined;

// VITE_BACKEND_API_URL is expected to end with `/api`.
// Socket.IO should connect to the backend origin (no `/api` suffix).
const SOCKET_URL = backendApiUrl
  ? backendApiUrl.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

let socket: Socket | null = null;

/**
 * Initialize socket connection with auth token.
 * Should be called after user logs in.
 */
export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
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