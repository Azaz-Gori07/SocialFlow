import mongoose, { Schema, Document, Model } from 'mongoose';
import { SocialPlatform, ConnectionStatus } from '../../types';

/**
 * User-level OAuth connection. Holds the encrypted provider token that grants
 * access to one or more provider accounts (pages, IG business accounts...).
 * Account-level tokens (e.g. Meta page tokens) live on the SocialAccount.
 */
export interface IOAuthConnection extends Document {
  userId: string;
  platform: SocialPlatform;
  provider: 'meta' | 'twitter' | 'linkedin' | 'google';
  /** Provider user-level account id (Meta user id, X user id, LinkedIn sub, Google sub). */
  externalAccountId: string;
  status: ConnectionStatus;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: string;
  scopes: string[];
  lastValidatedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const OAuthConnectionSchema = new Schema<IOAuthConnection>(
  {
    userId: { type: String, required: true },
    platform: { type: String, required: true },
    provider: { type: String, enum: ['meta', 'twitter', 'linkedin', 'google'], required: true },
    externalAccountId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'connected', 'expired', 'revoked', 'error'],
      default: 'connected',
    },
    encryptedAccessToken: { type: String, required: true },
    encryptedRefreshToken: { type: String },
    accessTokenExpiresAt: { type: String },
    scopes: { type: [String], default: [] },
    lastValidatedAt: { type: String },
    lastError: { type: String },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  {
    timestamps: false,
    collection: 'oauth_connections',
    toJSON: {
      virtuals: true,
      transform: (doc, ret: any) => {
        ret._id = ret._id.toString();
        delete ret.__v;
        // Tokens never leave the server.
        delete ret.encryptedAccessToken;
        delete ret.encryptedRefreshToken;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

OAuthConnectionSchema.index({ userId: 1, platform: 1, externalAccountId: 1 }, { unique: true });
OAuthConnectionSchema.index({ userId: 1, status: 1 });

export const OAuthConnectionModel =
  (mongoose.models.OAuthConnection as Model<IOAuthConnection>) ||
  mongoose.model<IOAuthConnection>('OAuthConnection', OAuthConnectionSchema);
export default OAuthConnectionModel;
