import mongoose, { Schema, Document, Model } from 'mongoose';
import { SocialPlatform } from '../../types';

/**
 * Server-side OAuth transaction (guideline §22).
 * The `state` value must be unpredictable, bound to the user, time-limited,
 * one-time-use and protected against replay. The PKCE verifier lives here —
 * never in the URL and never in the frontend.
 */
export interface IOAuthTransaction extends Document {
  /** The OAuth `state` value. */
  state: string;
  userId: string;
  platform: SocialPlatform;
  redirectUri: string;
  /** PKCE S256 verifier for providers that support it. */
  codeVerifier?: string;
  status: 'pending' | 'used' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

const OAuthTransactionSchema = new Schema<IOAuthTransaction>(
  {
    state: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    platform: { type: String, required: true },
    redirectUri: { type: String, required: true },
    codeVerifier: { type: String },
    status: { type: String, enum: ['pending', 'used', 'expired'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: false, collection: 'oauth_transactions' }
);

// Auto-expire pending transactions.
OAuthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthTransactionModel =
  (mongoose.models.OAuthTransaction as Model<IOAuthTransaction>) ||
  mongoose.model<IOAuthTransaction>('OAuthTransaction', OAuthTransactionSchema);
export default OAuthTransactionModel;
