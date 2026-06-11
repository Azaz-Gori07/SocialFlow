import mongoose, { Schema, model, Document, Model } from 'mongoose';

export interface ISocialAccount extends Document {
  userId: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok';
  accountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

const SocialAccountSchema = new Schema<ISocialAccount>({
  userId: { type: String, required: true },
  platform: { type: String, required: true },
  accountId: { type: String, required: true },
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  avatarUrl: { type: String },
  accessToken: { type: String, required: true },
  refreshToken: { type: String },
  expiresAt: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
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
SocialAccountSchema.index({ userId: 1, platform: 1 });
SocialAccountSchema.index({ userId: 1, platform: 1, accountId: 1 }, { unique: true });
SocialAccountSchema.index({ expiresAt: 1 });

export const SocialAccountModel = (mongoose.models.SocialAccount as Model<ISocialAccount>) || model<ISocialAccount>('SocialAccount', SocialAccountSchema);
export default SocialAccountModel;
