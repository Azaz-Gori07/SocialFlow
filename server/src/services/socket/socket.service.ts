import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Notification } from '../../features/notification/notification.types';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_socialflow_token_key_123!';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for Socket.IO
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as { id: string; email: string };
      socket.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Socket connected: user=${socket.userId}, socketId=${socket.id}`);

    // Join a room specific to the user for targeted notifications
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Handle client-side read acknowledgement
    socket.on('notification:read', (data: { notificationId: string }) => {
      if (socket.userId) {
        io?.to(`user:${socket.userId}`).emit('notification:read', data);
      }
    });

    socket.on('notification:readAll', () => {
      if (socket.userId) {
        io?.to(`user:${socket.userId}`).emit('notification:readAll', { userId: socket.userId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: user=${socket.userId}, socketId=${socket.id}, reason=${reason}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocketIO first.');
  }
  return io;
}

/**
 * Send a real-time notification to a specific user.
 * If the user is offline, the notification will be stored in the database
 * and delivered when they reconnect (offline recovery).
 */
export function sendNotification(userId: string, notification: Notification): void {
  if (!io) {
    console.warn('⚠️ Socket.IO not initialized. Cannot send notification.');
    return;
  }
  io.to(`user:${userId}`).emit('notification', notification);
  io.to(`user:${userId}`).emit('notifications:unread_count', { count: 1 });
}

/**
 * Send updated unread count to a user.
 */
export function sendUnreadCount(userId: string, count: number): void {
  if (!io) {
    return;
  }
  io.to(`user:${userId}`).emit('notifications:unread_count', { count });
}