import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface IPost extends Document {
  userId: string;
  platforms: string[];
  content: string;
  platformContent?: Record<string, any>;
  media?: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledAt?: string;
  publishedAt?: string;
  failedReason?: string;
  createdAt: string;
}

const PostSchema = new Schema<IPost>({
  userId: { type: String, required: true, index: true },
  platforms: { type: [String], required: true },
  content: { type: String, required: true },
  platformContent: { type: Schema.Types.Mixed, default: {} },
  media: { type: [String], default: [] },
  status: {
    type: String,
    required: true,
    enum: ['draft', 'scheduled', 'published', 'failed'],
    default: 'draft'
  },
  scheduledAt: { type: String },
  publishedAt: { type: String },
  failedReason: { type: String },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: false,
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

// Indexes
PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ status: 1, scheduledAt: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });

export const PostModel = (mongoose.models.Post as Model<IPost>) || model<IPost>('Post', PostSchema);
export default PostModel;
