import mongoose, { Schema, model, Document, Model } from 'mongoose';

export type DraftPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'youtube';

// Phase 2: Full lifecycle — draft → ready → publishing → published | failed
export type DraftStatus = 'draft' | 'ready' | 'publishing' | 'archived' | 'published' | 'failed';

export interface IPlatformResponse {
  postId?: string;
  url?: string;
  platform: DraftPlatform;
  raw?: any;
}

export interface IMediaRef {
  url: string;
  type: 'image' | 'video' | 'document';
  name: string;
  size?: number;
}

export interface IDraft extends Document {
  userId: string;
  platform: DraftPlatform;
  contentType: 'post' | 'story' | 'reel' | 'video' | 'carousel' | 'thread';
  media: IMediaRef[];
  caption?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  retryCount: number;
  failedReason?: string;
  // Phase 2: Publishing lifecycle fields
  platformResponse?: IPlatformResponse;
  lastAttemptAt?: string;
  errorMessage?: string;
  scheduledAt?: string;
}

const MediaRefSchema = new Schema<IMediaRef>({
  url: { type: String, required: true },
  type: { type: String, required: true, enum: ['image', 'video', 'document'] },
  name: { type: String, required: true },
  size: { type: Number }
}, { _id: false });

const PlatformResponseSchema = new Schema<IPlatformResponse>({
  postId: { type: String },
  url: { type: String },
  platform: { type: String, required: true },
  raw: { type: Schema.Types.Mixed }
}, { _id: false });

const DraftSchema = new Schema<IDraft>({
  userId: { type: String, required: true, index: true },
  platform: {
    type: String,
    required: true,
    enum: ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'],
    index: true
  },
  contentType: {
    type: String,
    required: true,
    enum: ['post', 'story', 'reel', 'video', 'carousel', 'thread'],
    default: 'post'
  },
  media: { type: [MediaRefSchema], default: [] },
  caption: { type: String },
  status: {
    type: String,
    required: true,
    enum: ['draft', 'ready', 'publishing', 'archived', 'published', 'failed'],
    default: 'draft'
  },
  publishedAt: { type: String },
  retryCount: { type: Number, default: 0 },
  failedReason: { type: String },
  // Phase 2 fields
  platformResponse: { type: PlatformResponseSchema },
  lastAttemptAt: { type: String },
  errorMessage: { type: String },
  scheduledAt: { type: String }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc: any, ret: any) => {
      ret._id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Compound indexes for platform-isolated queries
DraftSchema.index({ userId: 1, platform: 1, status: 1 });
DraftSchema.index({ userId: 1, platform: 1, createdAt: -1 });
DraftSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Phase 2: Index for scheduler queries — find ready drafts by platform
DraftSchema.index({ platform: 1, status: 1, createdAt: 1 });
DraftSchema.index({ status: 1, lastAttemptAt: 1 });

export const DraftModel = (mongoose.models.Draft as Model<IDraft>) || model<IDraft>('Draft', DraftSchema);
export default DraftModel;