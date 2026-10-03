// Canonical shared types for SocialFlow.
// These are the JSON shapes consumed by services, controllers and the frontend.
// Mongoose models in features/* must stay aligned with these shapes.

// ── Social ────────────────────────────────────────────────────────────────────

export type SocialPlatform = 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'threads';

export type AccountType = 'profile' | 'page' | 'business' | 'group' | 'organization';

/** Platform-level capabilities for one connected account. */
export interface SocialCapabilities {
  createPost: boolean;
  uploadMedia: boolean;
  getInsights: boolean;
  listComments: boolean;
  replyToComment: boolean;
  /** Media kinds the account can attach to a post. */
  mediaTypes: Array<'image' | 'video' | 'text'>;
}

export type ConnectionStatus = 'pending' | 'connected' | 'expired' | 'revoked' | 'error';

export type AccountStatus = 'active' | 'pending' | 'error' | 'disconnected';

/** A single connected platform account (page, profile, business account...). */
export interface SocialAccount {
  _id: string;
  userId: string; // owner
  workspaceId?: string;
  platform: SocialPlatform;
  accountType: AccountType;
  /** Unique external identifier assigned by the provider. */
  providerAccountId: string;
  /** Parent entity, e.g. the Facebook Page behind an Instagram business account. */
  providerParentAccountId?: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  capabilities: SocialCapabilities;
  status: AccountStatus;
  connectionStatus: ConnectionStatus;
  lastValidatedAt?: string;
  lastSyncedAt?: string;
  createdAt: string;
}

/**
 * User-level OAuth connection (e.g. the Meta user token that grants access to
 * several pages/business accounts). Tokens are stored encrypted server-side
 * and are never part of this JSON shape.
 */
export interface OAuthConnection {
  _id: string;
  userId: string;
  platform: SocialPlatform;
  /** The provider's user-level account identifier. */
  externalAccountId: string;
  provider: 'meta' | 'twitter' | 'linkedin';
  status: ConnectionStatus;
  scopes: string[];
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Posts & deliveries ────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial_failure' | 'failed';

export type DeliveryStatus =
  | 'queued'
  | 'in_progress'
  | 'published'
  | 'failed'
  | 'dead'
  | 'cancelled';

/** One publish attempt against one destination account. */
export interface Delivery {
  _id: string;
  accountId: string;
  platform: SocialPlatform;
  /** Per-destination content override; falls back to the post's content. */
  content: string;
  status: DeliveryStatus;
  /** Provider post id, e.g. FB post id, X tweet id. */
  externalPostId?: string;
  externalPostUrl?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  /** Only set while status is retrying/failed-dead after backoff. */
  nextRetryAt?: string;
  /** Random, per-delivery, persisted before the first API call. */
  idempotencyKey: string;
  scheduledAt: string;
  publishedAt?: string;
  createdAt: string;
}

export interface Post {
  _id: string;
  userId: string; // creator
  workspaceId?: string;
  content: string; // fallback/default content
  platformContent?: Partial<Record<SocialPlatform, string>>;
  media?: string[]; // media URLs
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt?: string;
  deliveries: Delivery[];
  failedReason?: string;
  /** True when at least one delivery succeeded and at least one is not. */
  isPartialFailure?: boolean;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export type CommentStatus = 'unresolved' | 'resolved';

export interface CommentAuthor {
  username: string;
  avatarUrl?: string;
  displayName?: string;
}

export interface CommentReply {
  _id: string;
  author: CommentAuthor & { isSystemUser?: boolean };
  message: string;
  /** True when this reply was pushed back to the provider. */
  sentToProvider?: boolean;
  createdAt: string;
}

export interface Comment {
  _id: string;
  platform: SocialPlatform;
  /** Our SocialAccount._id. */
  accountId: string;
  /** Provider-side post id the comment belongs to. */
  postId: string;
  postTitle?: string;
  /** Provider-side comment id, used for replies + webhook dedupe. */
  externalCommentId: string;
  author: CommentAuthor;
  message: string;
  status: CommentStatus;
  assignedTo?: string;
  workspaceId?: string;
  replies: CommentReply[];
  createdAt: string;
}

// ── Workspace ────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Workspace {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface WorkspaceMember {
  _id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
}

// ── AI ───────────────────────────────────────────────────────────────────────

export interface AIGeneration {
  _id: string;
  userId: string;
  workspaceId?: string;
  prompt: string;
  outputs: Partial<Record<SocialPlatform, string>>;
  createdAt: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsMetric {
  _id: string;
  userId: string;
  workspaceId?: string;
  accountId: string;
  platform: SocialPlatform;
  /** YYYY-MM-DD. */
  date: string;
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  clicks: number;
  /** Where the metric came from: a provider pull or a webhook push. */
  source: 'provider' | 'webhook';
  /** Raw provider payload kept for debugging/re-sync. */
  raw?: Record<string, any>;
  createdAt: string;
}

// ── Notifications & activity ─────────────────────────────────────────────────

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'new_comment'
  | 'workspace_invite'
  | 'subscription_update'
  | 'analytics_alert'
  | 'insight';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ActivityLog {
  _id: string;
  userId: string;
  workspaceId?: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface GrowthInsight {
  _id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  recommendation: string;
  platform?: SocialPlatform;
  metricImpact?: string;
  createdAt: string;
}

// ── Users ────────────────────────────────────────────────────────────────────

export interface User {
  _id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
}
