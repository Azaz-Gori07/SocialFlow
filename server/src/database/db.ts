import mongoose, { Schema, model, Model } from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

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

const UserSchema = new Schema({
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

const SocialAccountSchema = new Schema({
  userId: { type: String, required: true },
  platform: { type: String, required: true },
  accountId: { type: String, required: true },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  avatarUrl: { type: String },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  expiresAt: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} }
}, schemaOptions);

const PostSchema = new Schema({
  userId: { type: String, required: true },
  platforms: { type: [String], required: true },
  content: { type: String, required: true },
  platformContent: { type: Schema.Types.Mixed, default: {} },
  media: { type: [String], default: [] },
  status: { type: String, required: true, enum: ['draft', 'scheduled', 'published', 'failed'] },
  scheduledAt: { type: String },
  publishedAt: { type: String },
  failedReason: { type: String }
}, schemaOptions);

const CommentSchema = new Schema({
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

const WorkspaceSchema = new Schema({
  name: { type: String, required: true },
  ownerId: { type: String, required: true }
}, schemaOptions);

const WorkspaceMemberSchema = new Schema({
  workspaceId: { type: String, required: true },
  userId: { type: String, required: true },
  role: { type: String, required: true, enum: ['owner', 'admin', 'editor', 'viewer'] }
}, schemaOptions);

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
  ctr: { type: Number, default: 0 }
}, schemaOptions);
AnalyticsMetricSchema.index({ accountId: 1, date: -1 });
AnalyticsMetricSchema.index({ userId: 1, date: -1 });

const NotificationSchema = new Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  type: { type: String, required: true }
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

const UserModel = (mongoose.models.User as Model<any>) || model('User', UserSchema);
const SocialAccountModel = (mongoose.models.SocialAccount as Model<any>) || model('SocialAccount', SocialAccountSchema);
const PostModel = (mongoose.models.Post as Model<any>) || model('Post', PostSchema);
const CommentModel = (mongoose.models.Comment as Model<any>) || model('Comment', CommentSchema);
const WorkspaceModel = (mongoose.models.Workspace as Model<any>) || model('Workspace', WorkspaceSchema);
const WorkspaceMemberModel = (mongoose.models.WorkspaceMember as Model<any>) || model('WorkspaceMember', WorkspaceMemberSchema);
const AIGenerationModel = (mongoose.models.AIGeneration as Model<any>) || model('AIGeneration', AIGenerationSchema);
const AnalyticsMetricModel = (mongoose.models.AnalyticsMetric as Model<any>) || model('AnalyticsMetric', AnalyticsMetricSchema);
const NotificationModel = (mongoose.models.Notification as Model<any>) || model('Notification', NotificationSchema);
const ActivityLogModel = (mongoose.models.ActivityLog as Model<any>) || model('ActivityLog', ActivityLogSchema);
const GrowthInsightModel = (mongoose.models.GrowthInsight as Model<any>) || model('GrowthInsight', GrowthInsightSchema);

async function connectDb() {
  try {
    console.log(`🔌 Connecting to MongoDB Atlas: ${MONGO_URI.replace(/\/\/.*@/, '//***:***@')}`);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
      dbName: process.env.MONGO_DB_NAME || undefined
    });
    console.log('✅ MongoDB Atlas connected.');
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
      console.warn("⚠️ DNS SRV resolution failed. Retrying with Google/Cloudflare public DNS servers...");
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        await mongoose.connect(MONGO_URI, {
          serverSelectionTimeoutMS: 8000,
          retryWrites: true,
          dbName: process.env.MONGO_DB_NAME || undefined
        });
        console.log('✅ MongoDB Atlas connected.');
        return;
      } catch (retryError: any) {
        console.error("❌ Database connection failed after retrying with public DNS:");
        console.error(retryError.message);
        throw retryError;
      }
    } else {
      console.error('❌ MongoDB Atlas connection failed:', error.message);
      throw new Error(`MongoDB Atlas connection failed: ${error.message}`);
    }
  }
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
  insights: GrowthInsightModel
};

export { mongoose, connectDb };
