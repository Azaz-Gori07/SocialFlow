import mongoose, { Schema, model, Document, Model } from 'mongoose';

export type DeliveryStatus = 'pending' | 'publishing' | 'published' | 'failed';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial_failure' | 'failed';

export interface IPostMediaRef {
  url: string;
  kind: 'image' | 'video' | 'document';
  name?: string;
}

export interface IDelivery extends Document {
  socialAccountId: string;
  platform: string;
  status: DeliveryStatus;
  externalPostId?: string;
  externalPostUrl?: string;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lastErrorCode?: string;
  deadLettered: boolean;
  nextRetryAt?: string;
  publishedAt?: string;
}

export interface IPost extends Document {
  userId: string;
  workspaceId?: string;
  platforms: string[];
  content: string;
  platformContent?: Record<string, unknown>;
  media: IPostMediaRef[];
  status: PostStatus;
  deliveries: IDelivery[];
  /** Bumped on every re-schedule; part of the idempotency key (guideline §19). */
  scheduledAttempt: number;
  /** Set when the post was created from a draft (publishing via drafts). */
  draftId?: string;
  /**
   * Immutable resolved target snapshot (SocialAccount _ids) captured when the
   * content was targeted/scheduled; the scheduler never re-resolves from the
   * current account list. Absent on legacy posts → historical fan-out.
   */
  targetAccountIds?: string[];
  scheduledAt?: string;
  /**
   * Where the targeting came from: manual | ai | csv | ai_autoschedule.
   * Only ever set from real provenance ('ai' only when the content was
   * actually AI-generated); absent on legacy posts.
   */
  source?: 'manual' | 'ai' | 'csv' | 'ai_autoschedule';
  publishedAt?: string;
  failedReason?: string;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

const PostMediaRefSchema = new Schema<IPostMediaRef>(
  {
    url: { type: String, required: true },
    kind: { type: String, required: true, enum: ['image', 'video', 'document'] },
    name: { type: String }
  },
  { _id: false }
);

const DeliverySchema = new Schema<IDelivery>(
  {
    socialAccountId: { type: String, required: true },
    platform: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'publishing', 'published', 'failed'],
      default: 'pending'
    },
    externalPostId: { type: String },
    externalPostUrl: { type: String },
    idempotencyKey: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 5 },
    lastError: { type: String },
    lastErrorCode: { type: String },
    deadLettered: { type: Boolean, default: false },
    nextRetryAt: { type: String },
    publishedAt: { type: String }
  },
  { _id: false }
);

const PostSchema = new Schema<IPost>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String },
    platforms: { type: [String], required: true },
    content: { type: String, required: true },
    platformContent: { type: Schema.Types.Mixed, default: {} },
    media: { type: [PostMediaRefSchema], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'scheduled', 'publishing', 'published', 'partial_failure', 'failed'],
      default: 'draft'
    },
    deliveries: { type: [DeliverySchema], default: [] },
    scheduledAttempt: { type: Number, default: 1 },
    draftId: { type: String },
    // default: undefined disables Mongoose's implicit [] default so legacy
    // posts stay absent rather than looking explicitly untargeted.
    targetAccountIds: { type: [String], default: undefined },
    source: { type: String, enum: ['manual', 'ai', 'csv', 'ai_autoschedule'] },
    scheduledAt: { type: String },
    publishedAt: { type: String },
    failedReason: { type: String },
    lastAttemptAt: { type: String },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() }
  },
  {
    timestamps: false,
    toJSON: {
      virtuals: true,
      transform: (doc: any, ret: any) => {
        ret._id = ret._id.toString();
        ret.deliveries = (ret.deliveries || []).map((d: any) => ({
          ...d,
          idempotencyKey: undefined,
          _id: undefined
        }));
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// Indexes
PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ status: 1, scheduledAt: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ draftId: 1 });
// Idempotency guard: unique key per delivery (guideline §19)
PostSchema.index({ 'deliveries.idempotencyKey': 1 }, { unique: true, sparse: true });
// Scheduler: due retries
PostSchema.index({ status: 1, 'deliveries.status': 1, 'deliveries.nextRetryAt': 1 });

export const PostModel = (mongoose.models.Post as Model<IPost>) || model<IPost>('Post', PostSchema);
export default PostModel;
