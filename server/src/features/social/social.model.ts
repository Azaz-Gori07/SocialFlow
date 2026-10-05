import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  SocialPlatform,
  AccountType,
  SocialCapabilities,
  AccountStatus,
  ConnectionStatus,
} from '../../types';
import { ProviderCapabilities } from '../../services/social/interfaces/socialProvider.interface';

export interface ISocialAccount extends Document {
  userId: string;
  workspaceId?: string;
  platform: SocialPlatform;
  accountType: AccountType;
  /** Unique provider-assigned id (page id, IG user id, X user id, LinkedIn urn suffix). */
  providerAccountId: string;
  /** Parent entity (Facebook Page behind an Instagram business account). */
  providerParentAccountId?: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  /** Normalized capabilities for publishing flows. */
  capabilities: SocialCapabilities;
  /** Full provider capability matrix for dynamic UI. */
  providerCapabilities: ProviderCapabilities;
  status: AccountStatus;
  connectionStatus: ConnectionStatus;
  /**
   * Convenience preselection for NEW content only. Changing it never affects
   * already scheduled posts (their target snapshot is immutable).
   */
  publishDefault?: boolean;
  /** OAuthConnection._id when the token is user-level. */
  connectionId?: string;
  /** Account-scoped token (e.g. Meta page token). Encrypted at rest, never serialized. */
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: string;
  lastValidatedAt?: string;
  lastSyncedAt?: string;
  lastError?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, index: true },
    platform: { type: String, required: true },
    accountType: {
      type: String,
      enum: ['profile', 'page', 'business', 'group'],
      default: 'profile',
    },
    providerAccountId: { type: String, required: true },
    providerParentAccountId: { type: String },
    username: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: { type: String },
    capabilities: {
      createPost: { type: Boolean, default: false },
      uploadMedia: { type: Boolean, default: false },
      getInsights: { type: Boolean, default: false },
      listComments: { type: Boolean, default: false },
      replyToComment: { type: Boolean, default: false },
      mediaTypes: { type: [String], default: [] },
    },
    providerCapabilities: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['active', 'pending', 'error', 'disconnected'], default: 'active' },
    connectionStatus: {
      type: String,
      enum: ['pending', 'connected', 'expired', 'revoked', 'error'],
      default: 'connected',
    },
    connectionId: { type: String },
    publishDefault: { type: Boolean, default: false },
    encryptedAccessToken: { type: String },
    encryptedRefreshToken: { type: String },
    accessTokenExpiresAt: { type: String },
    lastValidatedAt: { type: String },
    lastSyncedAt: { type: String },
    lastError: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
  },
  {
    timestamps: false,
    collection: 'socialaccounts',
    toJSON: {
      virtuals: true,
      transform: (doc, ret: any) => {
        ret._id = ret._id.toString();
        delete ret.__v;
        // Tokens never leave the server (guideline §21).
        delete ret.encryptedAccessToken;
        delete ret.encryptedRefreshToken;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

SocialAccountSchema.index({ userId: 1, platform: 1, providerAccountId: 1 }, { unique: true });
SocialAccountSchema.index({ workspaceId: 1, platform: 1 });
SocialAccountSchema.index({ connectionId: 1 });

export const SocialAccountModel =
  (mongoose.models.SocialAccount as Model<ISocialAccount>) ||
  mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema);
export default SocialAccountModel;
