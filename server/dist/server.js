"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = __importDefault(require("http"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const env_config_1 = require("./shared/config/env.config");
const error_middleware_1 = require("./shared/middleware/error.middleware");
const auth_routes_1 = __importDefault(require("./features/auth/auth.routes"));
const workspace_routes_1 = __importDefault(require("./features/workspace/workspace.routes"));
const social_routes_1 = __importDefault(require("./features/social/social.routes"));
const post_routes_1 = __importDefault(require("./features/post/post.routes"));
const comment_routes_1 = __importDefault(require("./features/comment/comment.routes"));
const notification_routes_1 = __importDefault(require("./features/notification/notification.routes"));
const draft_routes_1 = __importDefault(require("./features/draft/draft.routes"));
const dashboardController_1 = require("./controllers/dashboardController");
const aiController_1 = require("./controllers/aiController");
const socialController_1 = require("./controllers/socialController");
const workspaceController_1 = require("./controllers/workspaceController");
const auth_1 = require("./middleware/auth");
const swagger_json_1 = __importDefault(require("./docs/swagger.json"));
const socket_service_1 = require("./services/socket/socket.service");
const scheduler_1 = require("./services/scheduler");
// Import the Atlas database connection and fail fast on startup if it cannot connect.
const db_1 = require("./database/db");
// Import worker to initialize the post scheduling queue listener
require("./services/queue/post.worker");
const app = (0, express_1.default)();
exports.app = app;
const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5000'];
const EXPLICIT_ORIGINS = [
    'https://viraldrift.vercel.app',
    'https://viraldrift-server.vercel.app',
];
const envOrigins = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS)
    ? (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS).split(',').map(s => s.trim()).filter(Boolean)
    : [];
const staticOrigins = [...new Set([...LOCAL_ORIGINS, ...EXPLICIT_ORIGINS, ...envOrigins])];
const vercelOriginRegex = /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/;
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (staticOrigins.includes(origin))
            return callback(null, true);
        if (vercelOriginRegex.test(origin))
            return callback(null, true);
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Security Middleware
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 10000 : 100,
    message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);
// Helmet for setting secure HTTP headers
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
// Database connection check middleware for serverless/production requests
app.use(async (req, res, next) => {
    // Skip check for root health check, API health route, and swagger UI assets/docs
    if (req.path === '/' ||
        req.path === '/health' ||
        req.path === '/cors-debug' ||
        req.path === '/api/test/limit' ||
        req.path.startsWith('/api-docs')) {
        return next();
    }
    if (!(0, db_1.isConnected)()) {
        try {
            await (0, db_1.connectDb)();
        }
        catch (error) {
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
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_json_1.default));
// Simple test endpoint for rate‑limit verification (returns 200)
app.get('/api/test/limit', (req, res) => {
    res.status(200).json({ message: 'ok' });
});
// Route Mounts
app.use('/api/auth', auth_routes_1.default);
app.use('/api/workspace', workspace_routes_1.default);
app.use('/api/social', social_routes_1.default);
app.use('/api/posts', post_routes_1.default);
app.use('/api/comments', comment_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/drafts', draft_routes_1.default);
// Dashboard routes (mounted from legacy controller)
app.get('/api/dashboard/overview', auth_1.authMiddleware, dashboardController_1.DashboardController.getOverview);
app.get('/api/dashboard/growth', auth_1.authMiddleware, dashboardController_1.DashboardController.getGrowth);
app.get('/api/dashboard/platforms', auth_1.authMiddleware, dashboardController_1.DashboardController.getPlatformBreakdown);
// AI & Insights routes (mounted from legacy controller)
app.post('/api/ai/generate-post', auth_1.authMiddleware, aiController_1.AIController.generatePost);
app.post('/api/ai/regenerate', auth_1.authMiddleware, aiController_1.AIController.regeneratePost);
app.post('/api/ai/reply-suggestion', auth_1.authMiddleware, aiController_1.AIController.suggestReply);
app.post('/api/repurpose/youtube', auth_1.authMiddleware, aiController_1.AIController.repurposeYoutube);
app.post('/api/repurpose/blog', auth_1.authMiddleware, aiController_1.AIController.repurposeBlog);
app.get('/api/insights', auth_1.authMiddleware, aiController_1.AIController.getInsights);
app.post('/api/insights/generate', auth_1.authMiddleware, aiController_1.AIController.generateInsights);
// Legacy social connect direct (used by Settings page for mock connection)
app.post('/api/social/connect-direct', auth_1.authMiddleware, socialController_1.SocialController.connectAccount);
// Legacy workspace role update (not yet migrated to features/workspace/)
app.put('/api/workspace/role', auth_1.authMiddleware, workspaceController_1.WorkspaceController.updateRole);
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
app.use(error_middleware_1.errorMiddleware);
// Create HTTP server for Socket.IO integration
const httpServer = http_1.default.createServer(app);
exports.httpServer = httpServer;
// Initialize Socket.IO for real-time notifications
(0, socket_service_1.initSocketIO)(httpServer);
// Start Listener if not in test mode and not on Vercel
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
    const startServer = async () => {
        try {
            await (0, db_1.connectDb)();
            scheduler_1.SchedulerService.start();
            const PORT = env_config_1.env.PORT || 5000;
            httpServer.listen(PORT, () => {
                console.log(`🚀 SocialFlow AI Server running at http://localhost:${PORT}`);
                console.log(`📖 Interactive Swagger documentation available at http://localhost:${PORT}/api-docs`);
                console.log(`🔔 Real-time notification service active (Socket.IO)`);
            });
        }
        catch (error) {
            console.error('❌ Failed to start server because MongoDB Atlas is unavailable:', error.message);
            process.exit(1);
        }
    };
    startServer();
}
exports.default = app;
