"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mongoose = exports.db = void 0;
exports.isConnected = isConnected;
exports.connectDb = connectDb;
const mongoose_1 = __importStar(require("mongoose"));
exports.mongoose = mongoose_1.default;
const dotenv_1 = __importDefault(require("dotenv"));
const dns_1 = __importDefault(require("dns"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/socialflow';
const schemaOptions = {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
            ret._id = ret._id.toString();
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
};
const UserSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String },
    fullName: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    provider: { type: String, enum: ['local', 'zenuxs-google', 'zenuxs-github'], default: 'local' },
    emailVerified: { type: Boolean, default: false },
    lastLogin: { type: Date },
    otpVerifiedAt: { type: Date },
    oauthProviderId: { type: String }
}, schemaOptions);
const SocialAccountSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    platform: { type: String, required: true },
    accountId: { type: String, required: true },
    username: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: { type: String },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    expiresAt: { type: String },
    metadata: { type: mongoose_1.Schema.Types.Mixed, default: {} }
}, schemaOptions);
const PostSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    platforms: { type: [String], required: true },
    content: { type: String, required: true },
    platformContent: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    media: { type: [String], default: [] },
    status: { type: String, required: true, enum: ['draft', 'scheduled', 'published', 'failed'] },
    scheduledAt: { type: String },
    publishedAt: { type: String },
    failedReason: { type: String }
}, schemaOptions);
const CommentSchema = new mongoose_1.Schema({
    platform: { type: String, required: true },
    accountId: { type: String, required: true },
    postId: { type: String, required: true },
    postTitle: { type: String },
    author: { username: String, displayName: String, avatarUrl: String },
    message: { type: String, required: true },
    status: { type: String, required: true, enum: ['unresolved', 'resolved'] },
    assignedTo: { type: String },
    replies: { type: [{ author: { username: String, displayName: String, avatarUrl: String, isSystemUser: Boolean }, message: String, createdAt: String }], default: [] }
}, schemaOptions);
const WorkspaceSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    ownerId: { type: String, required: true }
}, schemaOptions);
const WorkspaceMemberSchema = new mongoose_1.Schema({
    workspaceId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, required: true, enum: ['owner', 'admin', 'editor', 'viewer'] }
}, schemaOptions);
const AIGenerationSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    prompt: { type: String, required: true },
    outputs: { type: mongoose_1.Schema.Types.Mixed, default: {} }
}, schemaOptions);
const AnalyticsMetricSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    accountId: { type: String, required: true },
    platform: { type: String, required: true },
    date: { type: String, required: true },
    followers: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    watchTime: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 }
}, schemaOptions);
AnalyticsMetricSchema.index({ accountId: 1, date: -1 });
AnalyticsMetricSchema.index({ userId: 1, date: -1 });
const NotificationSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    type: { type: String, required: true }
}, schemaOptions);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
const ActivityLogSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    workspaceId: { type: String },
    action: { type: String, required: true },
    details: { type: String, required: true }
}, schemaOptions);
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ workspaceId: 1, createdAt: -1 });
const GrowthInsightSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    recommendation: { type: String, required: true },
    platform: { type: String },
    metricImpact: { type: String }
}, schemaOptions);
const UserModel = mongoose_1.default.models.User || (0, mongoose_1.model)('User', UserSchema);
const SocialAccountModel = mongoose_1.default.models.SocialAccount || (0, mongoose_1.model)('SocialAccount', SocialAccountSchema);
const PostModel = mongoose_1.default.models.Post || (0, mongoose_1.model)('Post', PostSchema);
const CommentModel = mongoose_1.default.models.Comment || (0, mongoose_1.model)('Comment', CommentSchema);
const WorkspaceModel = mongoose_1.default.models.Workspace || (0, mongoose_1.model)('Workspace', WorkspaceSchema);
const WorkspaceMemberModel = mongoose_1.default.models.WorkspaceMember || (0, mongoose_1.model)('WorkspaceMember', WorkspaceMemberSchema);
const AIGenerationModel = mongoose_1.default.models.AIGeneration || (0, mongoose_1.model)('AIGeneration', AIGenerationSchema);
const AnalyticsMetricModel = mongoose_1.default.models.AnalyticsMetric || (0, mongoose_1.model)('AnalyticsMetric', AnalyticsMetricSchema);
const NotificationModel = mongoose_1.default.models.Notification || (0, mongoose_1.model)('Notification', NotificationSchema);
const ActivityLogModel = mongoose_1.default.models.ActivityLog || (0, mongoose_1.model)('ActivityLog', ActivityLogSchema);
const GrowthInsightModel = mongoose_1.default.models.GrowthInsight || (0, mongoose_1.model)('GrowthInsight', GrowthInsightSchema);
// Configure custom DNS servers if provided in env
if (process.env.DNS_SERVERS) {
    try {
        const servers = process.env.DNS_SERVERS.split(',').map(s => s.trim());
        dns_1.default.setServers(servers);
        console.log(`✓ DNS servers set to: ${servers.join(', ')}`);
    }
    catch (err) {
        console.warn(`⚠️ Failed to set DNS servers from env: ${err.message}`);
    }
}
// Cache the connection promise at module level for serverless reuse
let cachedConnection = null;
async function connectDb() {
    // Return cached connection if already connected or connecting
    if (cachedConnection) {
        return cachedConnection;
    }
    // Create connection promise and cache it immediately to prevent multiple concurrent connects
    const connectionPromise = (async () => {
        try {
            console.log(`🔌 Connecting to MongoDB Atlas: ${MONGO_URI.replace(/\/\/.*@/, '//***:***@')}`);
            const conn = await mongoose_1.default.connect(MONGO_URI, {
                // Serverless-optimized connection options
                serverSelectionTimeoutMS: 5000, // Quick timeout for cold starts
                socketTimeoutMS: 10000, // Socket timeout for long operations
                maxPoolSize: 10, // Limit connection pool for serverless
                minPoolSize: 1, // Minimum connections to maintain
                waitQueueTimeoutMS: 10000, // Max wait for available connection
                retryWrites: true, // Retry writes for better reliability
                dbName: process.env.MONGO_DB_NAME || undefined
            });
            console.log('✅ Database connected successfully');
            return conn;
        }
        catch (error) {
            // Check if it's a DNS resolution error that might be fixed by public DNS
            if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
                console.warn("⚠️ DNS SRV resolution failed. Retrying with Google/Cloudflare public DNS servers...");
                try {
                    dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
                    const conn = await mongoose_1.default.connect(MONGO_URI, {
                        serverSelectionTimeoutMS: 5000,
                        socketTimeoutMS: 10000,
                        maxPoolSize: 10,
                        minPoolSize: 1,
                        waitQueueTimeoutMS: 10000,
                        retryWrites: true,
                        dbName: process.env.MONGO_DB_NAME || undefined
                    });
                    console.log('✅ Database connected successfully');
                    return conn;
                }
                catch (retryError) {
                    console.error("✗ Database connection failed after retrying with public DNS:");
                    console.error(retryError.message);
                    throw retryError;
                }
            }
            else {
                console.error("✗ Database connection failed:");
                console.error(error.message);
                throw error;
            }
        }
    })();
    cachedConnection = connectionPromise;
    return connectionPromise;
}
function isConnected() {
    return mongoose_1.default.connection.readyState === 1;
}
exports.db = {
    users: UserModel,
    socialAccounts: SocialAccountModel,
    posts: PostModel,
    comments: CommentModel,
    workspaces: WorkspaceModel,
    workspaceMembers: WorkspaceMemberModel,
    aiGenerations: AIGenerationModel,
    analytics: AnalyticsMetricModel,
    notifications: NotificationModel,
    activityLogs: ActivityLogModel,
    insights: GrowthInsightModel
};
