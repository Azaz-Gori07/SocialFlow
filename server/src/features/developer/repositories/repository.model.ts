import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeveloperSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

/**
 * A repository connected by the user and tracked for content generation.
 * Counts are stored as strings to match the DevFlow schema — GitHub returns
 * large integers that must not lose precision through a JS number.
 */
export interface IDeveloperRepository extends Document {
  userId: string;
  githubId: string;
  name?: string;
  fullName: string;
  description?: string;
  defaultBranch: string;
  isPrivate: boolean;
  ownerAvatarUrl?: string;
  language?: string;
  starsCount: string;
  forksCount: string;
  openIssuesCount: string;
  syncStatus: DeveloperSyncStatus;
  // Account-wide AI monitoring: when false the repo is blocklisted from the
  // automatic content pipeline (no analysis, opportunities, drafts, memory).
  // Plain GitHub sync still runs — the blocklist controls AI, not connection.
  aiMonitoring: boolean;
  lastSyncedAt?: Date | null;
  lastCommitSyncedAt?: Date | null;
  lastPrSyncedAt?: Date | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const DeveloperRepositorySchema = new Schema<IDeveloperRepository>(
  {
    userId: { type: String, required: true, index: true },
    githubId: { type: String, required: true },
    name: { type: String },
    fullName: { type: String, required: true, maxlength: 512 },
    description: { type: String },
    defaultBranch: { type: String, default: 'main' },
    isPrivate: { type: Boolean, default: false },
    ownerAvatarUrl: { type: String },
    language: { type: String },
    starsCount: { type: String, default: '0' },
    forksCount: { type: String, default: '0' },
    openIssuesCount: { type: String, default: '0' },
    syncStatus: {
      type: String,
      enum: ['idle', 'syncing', 'synced', 'error'],
      default: 'idle'
    },
    aiMonitoring: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: null },
    lastCommitSyncedAt: { type: Date, default: null },
    lastPrSyncedAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'developer_repositories',
    toJSON: {
      virtuals: true,
      transform: (doc: any, ret: any) => {
        ret._id = ret._id.toString();
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

DeveloperRepositorySchema.index({ userId: 1, githubId: 1 }, { unique: true });
DeveloperRepositorySchema.index({ userId: 1, syncStatus: 1 });

export const DeveloperRepositoryModel =
  (mongoose.models.DeveloperRepository as Model<IDeveloperRepository>) ||
  mongoose.model<IDeveloperRepository>('DeveloperRepository', DeveloperRepositorySchema);
export default DeveloperRepositoryModel;
