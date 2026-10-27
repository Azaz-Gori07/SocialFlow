import dns from 'dns';
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
import express, { RequestHandler } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { env } from './shared/config/env.config';
import { errorMiddleware } from './shared/middleware/error.middleware';
import authRouter from './features/auth/auth.routes';
import zenuxsCallbackRouter from './features/auth/zenuxs.callback.routes';
import workspaceRouter from './features/workspace/workspace.routes';
import socialRouter from './features/social/social.routes';
import postRouter from './features/post/post.routes';
import commentRouter from './features/comment/comment.routes';
import notificationRouter from './features/notification/notification.routes';
import draftRouter from './features/draft/draft.routes';
import webhookRouter from './features/webhooks/metaWebhook.routes';
import developerRouter from './features/developer/developer.routes';
import githubWebhookRouter from './features/developer/github/github.webhook.routes';
import complianceRouter from './features/compliance/compliance.routes';
import { startDeveloperScheduler } from './features/developer/jobs/developer.scheduler';
import { DashboardController } from './controllers/dashboardController';
import { AIController } from './controllers/aiController';
import { SearchController } from './features/search/search.controller';
import { authMiddleware } from './middleware/auth';
import swaggerDocument from './docs/swagger.json';
import { initSocketIO } from './services/socket/socket.service';
import { SchedulerService } from './services/scheduler';
import { processDuePosts } from './services/scheduler';
import { runDraftSweep } from './features/draft/draft.scheduler';
import { runDeveloperSchedulerTick } from './features/developer/jobs/developer.scheduler';

// Import the Atlas database connection and fail fast on startup if it cannot connect.
import { connectDb, isConnected, ensureFreshDb, markDbActivity } from './database/db';



const app = express();

// Vercel/Render sit behind a proxy that sets X-Forwarded-For. express-rate-limit
// refuses to key on it (and logs a validation error) unless trust proxy is on.
if (process.env.VERCEL || process.env.RENDER) {
  app.set('trust proxy', 1);
}

const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000'
];
const EXPLICIT_ORIGINS = [
  'https://viraldrift.vercel.app',
  'https://viraldrift-server.vercel.app',
  'https://socialflow-src9.onrender.com'
];

const rawEnvOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS;
const envOrigins = rawEnvOrigins
  ? rawEnvOrigins.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const staticOrigins = [...new Set([...LOCAL_ORIGINS, ...EXPLICIT_ORIGINS, ...envOrigins])];

const vercelOriginRegex = /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (staticOrigins.includes(origin)) return callback(null, true);
    if (vercelOriginRegex.test(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // x-api-key is documented for headless clients; allow it in browser CORS too.
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Security Middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 2000,
  // GitHub delivers webhooks from shared outbound IPs, so a burst from many
  // repositories exhausts this budget and GitHub disables the hook. The route
  // is HMAC-authenticated and answers 2xx quickly, so it is not a brute-force
  // surface. originalUrl, not path: the mount strips the /api prefix from path.
  skip: (req) =>
    req.originalUrl.startsWith('/api/webhooks/github') ||
    req.originalUrl.startsWith('/api/webhooks/meta') ||
    req.originalUrl.startsWith('/api/cron/sweep'),
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter as unknown as RequestHandler);

// Helmet for setting secure HTTP headers with cross-origin support for dev API clients
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

// Raw body capture for GitHub webhook signature verification (feature-flagged:
// with the flag off the route is not mounted at all). Registered BEFORE
// express.json() so the HMAC still sees the exact bytes GitHub signed.
if (env.developerFlowEnabled) {
  app.use('/api/webhooks/github', express.raw({ type: '*/*' }), (req: any, _res: any, next: any) => {
    req.rawBody = req.body;
    next();
  });
}

// Raw body capture for webhook signature verification. This MUST be registered
// BEFORE express.json(): once the JSON parser consumes the body, `req.body` is a
// parsed object, HMAC verification against the original bytes becomes impossible
// and `Buffer.from(object)` throws — crashing the process on every real webhook.
app.use('/api/webhooks/meta', express.raw({ type: '*/*' }), (req: any, _res: any, next: any) => {
  req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
  next();
});

app.use(express.json());

// Serverless scheduler sweep: there is no setInterval on Vercel, so due
// scheduled posts / ready drafts are processed opportunistically — fired on
// any API request (throttled per instance) and by POST /api/cron/sweep.
let sweepRunning = false;
let lastSweepAt = 0;
const SWEEP_COOLDOWN_MS = 25 * 1000;

type SweepOutcome = { ok: boolean; ms: number; error?: string };

async function runSweepOnce(force = false, includeDevTick = false): Promise<Record<string, SweepOutcome>> {
  const out: Record<string, SweepOutcome> = {};
  // force: the explicit cron endpoint must run even when the opportunistic
  // middleware just started a fire-and-forget sweep on this same request —
  // that one dies with the lambda freeze; only the awaited one completes.
  // Overlap is safe: posts/deliveries are claimed atomically and the
  // developer tick has its own running guard.
  //
  // includeDevTick: the developer tick (repo syncs + daily-window generation,
  // 40-90s) can only complete inside an AWAITED request — a fire-and-forget
  // middleware sweep freezes mid-tick on serverless. Only the explicit cron
  // route includes it.
  if (sweepRunning && !force) return { skipped: { ok: true, ms: 0, error: 'already-running' } };
  sweepRunning = true;
  const parts: Array<[string, () => Promise<unknown>]> = [
    ['posts', () => processDuePosts()],
    ['drafts', () => runDraftSweep()]
  ];
  if (includeDevTick) parts.push(['devTick', () => runDeveloperSchedulerTick()]);
  try {
    await Promise.all(parts.map(async ([name, fn]) => {
      const t0 = Date.now();
      try {
        await fn();
        out[name] = { ok: true, ms: Date.now() - t0 };
      } catch (e: any) {
        out[name] = { ok: false, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 200) };
      }
    }));
  } finally {
    lastSweepAt = Date.now();
    sweepRunning = false;
  }
  return out;
}

function maybeSweep(force = false): void {
  if (process.env.NODE_ENV === 'test') return;
  if (sweepRunning) return;
  if (!force && Date.now() - lastSweepAt < SWEEP_COOLDOWN_MS) return;
  if (!force && !isConnected()) return;
  void runSweepOnce();
}

// Database connection check middleware for serverless/production requests
app.use(async (req, res, next) => {
  // Every request (including DB-free ones) doubles as a scheduler tick.
  maybeSweep();

  // Skip check for root health check, API health route, and swagger UI assets/docs.
  // '/api/developer/status' is DB-free by design — making it wait behind a cold
  // Mongo connect multiplies every navigation ping by the cold-start cost.
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path === '/cors-debug' ||
    req.path === '/api/test/limit' ||
    req.path === '/api/developer/status' ||
    req.path === '/api/cron/sweep' ||
    req.path.startsWith('/api-docs')
  ) {
    return next();
  }

  if (!isConnected()) {
    try {
      await connectDb();
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] DB connection failed for ${req.method} ${req.path}:`, error.message);
      return res.status(503).json({
        success: false,
        message: 'Database service temporarily unavailable. Please try again shortly.',
      });
    }
  } else {
    // Long-idle warm instance: verify the socket is truly alive before the
    // handler's first query hangs on a reaped connection.
    markDbActivity();
    const fresh = await ensureFreshDb();
    if (!fresh) {
      try {
        await connectDb();
      } catch (error: any) {
        console.error(`[${new Date().toISOString()}] DB reconnect failed for ${req.method} ${req.path}:`, error.message);
        return res.status(503).json({
          success: false,
          message: 'Database service temporarily unavailable. Please try again shortly.',
        });
      }
    }
  }

  next();
});

// Explicit scheduler tick for external warmups/crons. Idempotent: posts are
// claimed atomically so overlapping sweeps can never double-publish.
app.post('/api/cron/sweep', async (req, res) => {
  // Auth guard: CRON_SECRET required in production. Prevents unauthenticated
  // abuse of a heavy sweep endpoint (S3).
  const bearer = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? (req.headers['authorization'] as string).slice(7)
    : null;
  const secretOk = env.CRON_SECRET
    ? (req.headers['x-cron-secret'] === env.CRON_SECRET || bearer === env.CRON_SECRET || bearer === (req.headers['x-api-key'] as string | undefined))
    : req.headers['x-cron-secret'] === env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production' && !secretOk && bearer !== (req.headers['x-cron-secret'] as string | undefined)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  // The DB-connect middleware deliberately skips this path (same allowlist as
  // /api-docs), so without this the sweep buffered every query into a 10s
  // timeout and could never do any work.
  try {
    await connectDb();
  } catch (error: any) {
    return res.status(503).json({ success: false, message: 'Database unavailable for sweep.', error: error.message });
  }
  const outcomes = await runSweepOnce(true, true);
  res.json({ success: true, swept: true, at: new Date().toISOString(), outcomes });
});

// Zenuxs OAuth callback (registered redirect URI) — see the router for why the
// code is forwarded to the backend rather than exchanged in the browser.
app.use(zenuxsCallbackRouter);

// API Swagger Documentation Interface
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Simple test endpoint for rate‑limit verification (returns 200).
// Non-production only: keeps test/debug surface out of prod (S4).
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test/limit', (_req, res) => {
    res.status(200).json({ message: 'ok' });
  });
}

// Liveness probe backing the in-app status pill. Reports the real Mongoose
// connection state instead of a hardcoded "operational" label; unauthenticated
// because it exposes no user data.
app.get('/api/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  return res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    database: dbUp ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Route Mounts
app.use('/api/auth', authRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/social', socialRouter);
app.use('/api/posts', postRouter);
app.use('/api/comments', commentRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/drafts', draftRouter);
app.use('/api/compliance', complianceRouter);

// Webhooks (no auth middleware - verified via signature/challenge)
app.use('/api/webhooks', webhookRouter);
// GitHub webhook (no auth middleware - verified via HMAC signature)
if (env.developerFlowEnabled) {
  app.use('/api/webhooks/github', githubWebhookRouter);
}

// Developer Intelligence (gated inside the router; /status stays reachable)
app.use('/api/developer', developerRouter);

// Dashboard routes (mounted from legacy controller)
app.get('/api/dashboard/overview', authMiddleware as any, DashboardController.getOverview as any);
app.get('/api/dashboard/growth', authMiddleware as any, DashboardController.getGrowth as any);
app.get('/api/dashboard/platforms', authMiddleware as any, DashboardController.getPlatformBreakdown as any);
app.get('/api/dashboard/platform-growth', authMiddleware as any, DashboardController.getPlatformGrowth as any);
app.get('/api/search', authMiddleware as any, SearchController.search as any);

// AI & Insights routes (mounted from legacy controller)
app.post('/api/ai/generate-post', authMiddleware as any, AIController.generatePost as any);
app.post('/api/ai/regenerate', authMiddleware as any, AIController.regeneratePost as any);
app.post('/api/ai/reply-suggestion', authMiddleware as any, AIController.suggestReply as any);
app.post('/api/repurpose/youtube', authMiddleware as any, AIController.repurposeYoutube as any);
app.post('/api/repurpose/blog', authMiddleware as any, AIController.repurposeBlog as any);
app.get('/api/insights', authMiddleware as any, AIController.getInsights as any);
app.post('/api/insights/generate', authMiddleware as any, AIController.generateInsights as any);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// CORS debug diagnostics endpoint (no DB dependencies).
// Non-production only: it echoes CORS_ORIGIN/ALLOWED_ORIGINS config (S4).
if (process.env.NODE_ENV !== 'production') {
  app.get('/cors-debug', (_req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      LOCAL_ORIGINS,
      envOrigins,
      staticOrigins
    });
  });
}

// Centralized Error Interceptor (MUST be registered last)
app.use(errorMiddleware as any);

// Create HTTP server for Socket.IO integration
const httpServer = http.createServer(app);

// Initialize Socket.IO for real-time notifications
initSocketIO(httpServer);

// Start Listener if not in test mode and not on Vercel
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const startServer = async () => {
    try {
      await connectDb();
      SchedulerService.start();
      if (env.developerFlowEnabled) startDeveloperScheduler();

      const PORT = env.PORT || 5000;
      httpServer.listen(PORT, () => {
        console.log(`🚀 SocialFlow AI Server running at http://localhost:${PORT}`);
        console.log(`📖 Interactive Swagger documentation available at http://localhost:${PORT}/api-docs`);
        console.log(`🔔 Real-time notification service active (Socket.IO)`);
      });
    } catch (error: any) {
      console.error('❌ Failed to start server because MongoDB Atlas is unavailable:', error.message);
      process.exit(1);
    }
  };

  startServer();
}

export { app, httpServer };
export default app;
