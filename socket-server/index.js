/**
 * SocialFlow Socket.IO server — dedicated persistent service (Render).
 *
 * Why this exists: Vercel serverless functions have no persistent HTTP
 * server, so Socket.IO could never serve /socket.io/* there. The REST API
 * stays on Vercel; this process owns the WebSocket layer.
 *
 * Communication:
 *   Vercel REST backend --HTTP POST /internal/emit (secret)--> this process
 *   this process --socket.io--> authenticated browsers (room: user:<id>)
 *
 * Auth semantics are identical to the original socket.service.ts: the
 * client sends its JWT in handshake.auth.token and lands in `user:<id>`.
 */
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET;
// Server-to-server secret for POST /internal/emit. Set by the Vercel backend too.
const INTERNAL_SECRET = process.env.SOCKET_INTERNAL_SECRET;

if (!JWT_SECRET) {
  console.error('❌ Missing JWT_SECRET — cannot verify client tokens.');
  process.exit(1);
}
if (!INTERNAL_SECRET) {
  console.error('❌ Missing SOCKET_INTERNAL_SECRET — refusing to start an unauthenticated event inlet.');
  process.exit(1);
}

// Comma-separated browser origins allowed to open a socket. Anything else is
// rejected at the CORS layer (browser) — the /internal/emit endpoint is not
// browser-facing and authenticates via the internal secret instead.
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin, cb) => {
  if (!origin) return cb(null, true); // curl / server-to-server
  if (CORS_ORIGINS.includes(origin)) return cb(null, true);
  // Any Vercel preview/prod deployment of this project.
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
  // Local dev — only when explicitly listed in non-production.
  if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
    return cb(null, true);
  }
  return cb(new Error(`Origin ${origin} not allowed`), false);
};

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: isAllowedOrigin, methods: ['GET', 'POST'], credentials: true }));

// Liveness for Render health checks + humans.
app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'socialflow-socket',
  connections: io ? io.engine.clientsCount : 0,
  uptime: process.uptime()
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isAllowedOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Same auth middleware as the original server: JWT in handshake, resolve
// identity, deny anonymous connections.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication token required'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 connected user=${socket.userId} socket=${socket.id} clients=${io.engine.clientsCount}`);

  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  // Client acknowledges a read to its own room (multi-device sync — same
  // semantics as the original socket.service.ts).
  socket.on('notification:read', (data) => {
    if (socket.userId) io.to(`user:${socket.userId}`).emit('notification:read', data);
  });
  socket.on('notification:readAll', () => {
    if (socket.userId) io.to(`user:${socket.userId}`).emit('notification:readAll', { userId: socket.userId });
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 disconnected user=${socket.userId} socket=${socket.id} reason=${reason} clients=${io.engine.clientsCount}`);
  });
});

/**
 * Internal event inlet — called only by the Vercel REST backend.
 * Body: { userId, event, payload }
 *   event: 'notification' | 'notifications:unread_count' | 'notification:read' | 'notification:readAll'
 *
 * The userId comes from the trusted backend (behind the secret), never from
 * a browser, so a client can never address another user's room here.
 */
app.post('/internal/emit', (req, res) => {
  const provided = req.get('x-internal-secret') || '';
  if (provided !== INTERNAL_SECRET) {
    return res.status(401).json({ ok: false, error: 'bad secret' });
  }

  const { userId, event, payload } = req.body || {};
  if (!userId || typeof userId !== 'string' || !event || typeof event !== 'string') {
    return res.status(400).json({ ok: false, error: 'userId and event required' });
  }

  const ALLOWED = new Set(['notification', 'notifications:unread_count', 'notification:read', 'notification:readAll']);
  if (!ALLOWED.has(event)) {
    return res.status(400).json({ ok: false, error: `unknown event ${event}` });
  }

  const room = `user:${userId}`;
  const before = io.sockets.adapter.rooms.get(room)?.size || 0;
  io.to(room).emit(event, payload);
  console.log(`↪️ emit ${event} room=${room} recipients=${before}`);
  res.json({ ok: true, recipients: before });
});

server.listen(PORT, () => {
  console.log(`🔔 SocialFlow Socket.IO service listening on :${PORT}`);
  console.log(`   CORS origins: ${CORS_ORIGINS.join(', ') || '(vercel.app only)'}`);
  console.log(`   transport: polling + websocket upgrade`);
});
