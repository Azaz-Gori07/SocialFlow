import express, { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import swaggerUi from 'swagger-ui-express';
import { env } from './shared/config/env.config';
import { errorMiddleware } from './shared/middleware/error.middleware';
import authRouter from './features/auth/auth.routes';
import workspaceRouter from './features/workspace/workspace.routes';
import socialRouter from './features/social/social.routes';
import postRouter from './features/post/post.routes';
import commentRouter from './features/comment/comment.routes';
import notificationRouter from './features/notification/notification.routes';
import draftRouter from './features/draft/draft.routes';
import { DashboardController } from './controllers/dashboardController';
import { AIController } from './controllers/aiController';
import { SocialController } from './controllers/socialController';
import { WorkspaceController } from './controllers/workspaceController';
import { authMiddleware } from './middleware/auth';
import swaggerDocument from './docs/swagger.json';
import { initSocketIO } from './services/socket/socket.service';
import { SchedulerService } from './services/scheduler';

// Import the Atlas database connection and fail fast on startup if it cannot connect.
import { connectDb, isConnected } from './database/db';

// Import worker to initialize the post scheduling queue listener
import './services/queue/post.worker';

const app = express();

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5000'];
const EXPLICIT_ORIGINS = [
  'https://viraldrift.vercel.app',
  'https://viraldrift-server.vercel.app',
];

const envOrigins = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS)
  ? (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS)!.split(',').map(s => s.trim()).filter(Boolean)
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security Middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 100,
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter as unknown as RequestHandler);

// Helmet for setting secure HTTP headers
app.use(helmet());

app.use(express.json());

// Database connection check middleware for serverless/production requests
app.use(async (req, res, next) => {
  // Skip check for root health check, API health route, and swagger UI assets/docs
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path === '/cors-debug' ||
    req.path === '/api/test/limit' ||
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
  }

  next();
});

// API Swagger Documentation Interface
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Simple test endpoint for rate‑limit verification (returns 200)
app.get('/api/test/limit', (req, res) => {
  res.status(200).json({ message: 'ok' });
});

// Route Mounts
app.use('/api/auth', authRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/social', socialRouter);
app.use('/api/posts', postRouter);
app.use('/api/comments', commentRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/drafts', draftRouter);

// Dashboard routes (mounted from legacy controller)
app.get('/api/dashboard/overview', authMiddleware as any, DashboardController.getOverview as any);
app.get('/api/dashboard/growth', authMiddleware as any, DashboardController.getGrowth as any);
app.get('/api/dashboard/platforms', authMiddleware as any, DashboardController.getPlatformBreakdown as any);

// AI & Insights routes (mounted from legacy controller)
app.post('/api/ai/generate-post', authMiddleware as any, AIController.generatePost as any);
app.post('/api/ai/regenerate', authMiddleware as any, AIController.regeneratePost as any);
app.post('/api/ai/reply-suggestion', authMiddleware as any, AIController.suggestReply as any);
app.post('/api/repurpose/youtube', authMiddleware as any, AIController.repurposeYoutube as any);
app.post('/api/repurpose/blog', authMiddleware as any, AIController.repurposeBlog as any);
app.get('/api/insights', authMiddleware as any, AIController.getInsights as any);
app.post('/api/insights/generate', authMiddleware as any, AIController.generateInsights as any);

// Legacy social connect direct (used by Settings page for mock connection)
app.post('/api/social/connect-direct', authMiddleware as any, SocialController.connectAccount as any);

// Legacy workspace role update (not yet migrated to features/workspace/)
app.put('/api/workspace/role', authMiddleware as any, WorkspaceController.updateRole as any);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// CORS debug diagnostics endpoint (no DB dependencies)
app.get('/cors-debug', (req, res) => {
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
