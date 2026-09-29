import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A user's connected provider account (GitHub in Phase 1).
 * Tokens are stored encrypted at rest and must never be returned by the API —
 * the toJSON transform below strips them, mirroring the social OAuth model.
 */
export interface IDeveloperConnection extends Document {
  userId: string;
  provider: string;
  providerUserId?: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted?: string;
  scope?: string;
  tokenExpiresAt?: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const DeveloperConnectionSchema = new Schema<IDeveloperConnection>(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true, default: 'github' },
    providerUserId: { type: String },
    accessTokenEncrypted: { type: String, required: true },
    refreshTokenEncrypted: { type: String },
    scope: { type: String },
    tokenExpiresAt: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'developer_connections',
    toJSON: {
      virtuals: true,
      transform: (doc: any, ret: any) => {
        ret._id = ret._id.toString();
        delete ret.__v;
        // Tokens never leave the server.
        delete ret.accessTokenEncrypted;
        delete ret.refreshTokenEncrypted;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// One connection per user per provider.
DeveloperConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

export const DeveloperConnectionModel =
  (mongoose.models.DeveloperConnection as Model<IDeveloperConnection>) ||
  mongoose.model<IDeveloperConnection>('DeveloperConnection', DeveloperConnectionSchema);
export default DeveloperConnectionModel;
