import { Server as HttpServer } from 'http';
import https from 'https';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Notification } from '../../features/notification/notification.types';
import { env } from '../../shared/config/env.config';
import { db } from '../../database/db';

const JWT_SECRET = env.JWT_SECRET;

const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
const vercelOriginRegex = /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/;

const allowedOrigins = [...new Set([...LOCAL_ORIGINS, ...env.corsOrigins])];

const isAllowedOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  if (!origin || allowedOrigins.includes(origin) || vercelOriginRegex.test(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`CORS blocked origin: ${origin}`));
};

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: isAllowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for Socket.IO
  io.use((socket: Socket, next: (err?: Error) => void) => {
    const authSocket = socket as AuthenticatedSocket;
    const token = authSocket.handshake.auth?.token || authSocket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as { id: string; email: string };
      authSocket.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    console.log(`🔌 Socket connected: user=${authSocket.userId}, socketId=${authSocket.id}`);

    // Join a room specific to the user for targeted notifications
    if (authSocket.userId) {
      authSocket.join(`user:${authSocket.userId}`);
    }

    // Handle client-side read acknowledgement
    authSocket.on('notification:read', (data: { notificationId: string }) => {
      if (authSocket.userId) {
        io?.to(`user:${authSocket.userId}`).emit('notification:read', data);
      }
    });

    authSocket.on('notification:readAll', () => {
      if (authSocket.userId) {
        io?.to(`user:${authSocket.userId}`).emit('notification:readAll', { userId: authSocket.userId });
      }
    });

    authSocket.on('disconnect', (reason: string) => {
      console.log(`🔌 Socket disconnected: user=${authSocket.userId}, socketId=${authSocket.id}, reason=${reason}`);
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

// ---------------------------------------------------------------------------
// Event bridge: Vercel serverless backend -> dedicated Socket.IO service.
//
// When SOCKET_INTERNAL_URL is set (production on Vercel), events are POSTed
// to the Render socket-server's authenticated /internal/emit endpoint instead
// of a local `io` instance — serverless has no persistent connections to
// forward to. Unset (local dev/tests), the original in-process emit is used.
// ---------------------------------------------------------------------------
const SOCKET_INTERNAL_URL = process.env.SOCKET_INTERNAL_URL;
const SOCKET_INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

async function emitToUser(userId: string, event: string, payload: unknown): Promise<void> {
  if (SOCKET_INTERNAL_URL && SOCKET_INTERNAL_SECRET) {
    try {
      await postBridge({ userId, event, payload });
    } catch (err: any) {
      // Real-time is best-effort: the notification row is already persisted
      // and the client's REST refetch on reconnect covers the loss.
      console.warn(`⚠️ Socket bridge ${event} failed: ${err.message}`);
    }
    return;
  }
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

/**
 * POST to the Render socket-server. Uses https.request with `family: 4`
 * because onrender.com publishes NAT64 AAAA records that are unreachable
 * from Vercel's egress — undici's happy-eyeballs then stalls until timeout.
 */
export function postBridgeForProbe(body: unknown): Promise<void> {
  return postBridge(body);
}

function postBridge(body: unknown): Promise<void> {
  const url = new URL(`${SOCKET_INTERNAL_URL!.replace(/\/$/, '')}/internal/emit`);
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        family: 4,
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-internal-secret': SOCKET_INTERNAL_SECRET!,
        },
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }
    );
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Send a real-time notification to a specific user.
 * If the user is offline, the notification stays in the database and is
 * delivered when they reconnect (offline recovery).
 */
export async function sendNotification(userId: string, notification: Notification): Promise<void> {
  await emitToUser(userId, 'notification', notification);
  try {
    const count = await db.notifications.countDocuments({ userId, read: false }).exec();
    await emitToUser(userId, 'notifications:unread_count', { count });
  } catch (err) {
    console.warn('⚠️ Failed to compute unread count:', err);
  }
}

/**
 * Send updated unread count to a user.
 */
export function sendUnreadCount(userId: string, count: number): void {
  void emitToUser(userId, 'notifications:unread_count', { count });
}