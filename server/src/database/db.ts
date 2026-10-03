import mongoose, { Schema, model, Model } from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

// Ensure Node resolves IPv4 addresses first to avoid NAT64/IPv6 socket timeouts on cloud Mongo clusters
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Feature models are the single source of truth. Importing them here
// registers their schemas first, so the model() fallbacks below never
// re-register a conflicting schema for the same model name.
import UserModel from '../features/user/user.model';
import { SocialAccountModel } from '../features/social/social.model';
import PostModel from '../features/post/post.model';
import CommentModel from '../features/comment/comment.model';
import { WorkspaceModel, WorkspaceMemberModel } from '../features/workspace/workspace.model';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/socialflow';

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc: any, ret: any) => {
      ret._id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
};

const AIGenerationSchema = new Schema({
  userId: { type: String, required: true },
  prompt: { type: String, required: true },
  outputs: { type: Schema.Types.Mixed, default: {} }
}, schemaOptions);

const AnalyticsMetricSchema = new Schema({
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
  ctr: { type: Number, default: 0 },
  source: { type: String, enum: ['provider', 'webhook'], default: 'provider' }
}, schemaOptions);
AnalyticsMetricSchema.index({ accountId: 1, date: -1 });
AnalyticsMetricSchema.index({ userId: 1, date: -1 });

const NotificationSchema = new Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  type: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, schemaOptions);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const ActivityLogSchema = new Schema({
  userId: { type: String, required: true },
  workspaceId: { type: String },
  action: { type: String, required: true },
  details: { type: String, required: true }
}, schemaOptions);
ActivityLogSchema.index({ userId: 1, createdAt: -1 });
ActivityLogSchema.index({ workspaceId: 1, createdAt: -1 });

const GrowthInsightSchema = new Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  recommendation: { type: String, required: true },
  platform: { type: String },
  metricImpact: { type: String }
}, schemaOptions);

const NotificationPreferenceSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  email: {
    enabled: { type: Boolean, default: true },
    types: { type: [String], default: [] }
  },
  push: {
    enabled: { type: Boolean, default: true },
    types: { type: [String], default: [] }
  },
  inApp: {
    enabled: { type: Boolean, default: true },
    types: { type: [String], default: [] }
  }
}, schemaOptions);

const WebhookEventSchema = new Schema({
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, default: {} },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  error: { type: String },
  userId: { type: String },
}, schemaOptions);
WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
WebhookEventSchema.index({ processed: 1, createdAt: -1 });

const RefreshTokenSchema = new Schema({
  userId: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  rotatedFrom: { type: String },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });

const AuthCodeSchema = new Schema({
  userId: { type: String, required: true },
  codeHash: { type: String, required: true, unique: true },
  usedAt: { type: Date },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}, schemaOptions);
AuthCodeSchema.index({ usedAt: 1 });

const AIGenerationModel = (mongoose.models.AIGeneration as Model<any>) || model('AIGeneration', AIGenerationSchema);
const AnalyticsMetricModel = (mongoose.models.AnalyticsMetric as Model<any>) || model('AnalyticsMetric', AnalyticsMetricSchema);
const NotificationModel = (mongoose.models.Notification as Model<any>) || model('Notification', NotificationSchema);
const ActivityLogModel = (mongoose.models.ActivityLog as Model<any>) || model('ActivityLog', ActivityLogSchema);
const GrowthInsightModel = (mongoose.models.GrowthInsight as Model<any>) || model('GrowthInsight', GrowthInsightSchema);
const NotificationPreferenceModel = (mongoose.models.NotificationPreference as Model<any>) || model('NotificationPreference', NotificationPreferenceSchema);
const WebhookEventModel = (mongoose.models.WebhookEvent as Model<any>) || model('WebhookEvent', WebhookEventSchema);
const RefreshTokenModel = (mongoose.models.RefreshToken as Model<any>) || model('RefreshToken', RefreshTokenSchema);
const AuthCodeModel = (mongoose.models.AuthCode as Model<any>) || model('AuthCode', AuthCodeSchema);

// Configure custom DNS servers if provided in env
if (process.env.DNS_SERVERS) {
  try {
    const servers = process.env.DNS_SERVERS.split(',').map(s => s.trim());
    dns.setServers(servers);
    console.log(`✓ DNS servers set to: ${servers.join(', ')}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to set DNS servers from env: ${err.message}`);
  }
}

// Cache the connection promise at module level for serverless reuse
let cachedConnection: Promise<typeof mongoose> | null = null;

async function connectDb(): Promise<typeof mongoose> {
  // Return cached connection if already connected or connecting
  if (cachedConnection) {
    return cachedConnection;
  }

  // Create connection promise and cache it immediately to prevent multiple concurrent connects
  const connectionPromise = (async () => {
    try {
      console.log(`🔌 Connecting to MongoDB Atlas: ${MONGO_URI.replace(/\/\/.*@/, '//***:***@')}`);
      const conn = await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 20000,
        socketTimeoutMS: 20000,
        maxPoolSize: 50,
        retryWrites: true,
        family: 4,
        dbName: process.env.MONGO_DB_NAME || undefined
      });
      console.log('✅ Database connected successfully');
      return conn;
    } catch (error: any) {
      // Check if it's a DNS resolution error that might be fixed by public DNS
      if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
        console.warn("⚠️ DNS SRV resolution failed. Retrying with Google/Cloudflare public DNS servers...");
        try {
          dns.setServers(['8.8.8.8', '1.1.1.1']);
          const conn = await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 20000,
            socketTimeoutMS: 20000,
            maxPoolSize: 50,
            retryWrites: true,
            family: 4,
            dbName: process.env.MONGO_DB_NAME || undefined
          });
          console.log('✅ Database connected successfully');
          return conn;
        } catch (retryError: any) {
          console.error("✗ Database connection failed after retrying with public DNS:");
          console.error(retryError.message);
          throw retryError;
        }
      } else {
        console.error("✗ Database connection failed:");
        console.error(error.message);
        throw error;
      }
    }
  })();

  cachedConnection = connectionPromise;
  return connectionPromise;
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export const db = {
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
  insights: GrowthInsightModel,
  notificationPreferences: NotificationPreferenceModel,
  webhookEvents: WebhookEventModel,
  refreshTokens: RefreshTokenModel,
  authCodes: AuthCodeModel
};

export { mongoose, connectDb };

