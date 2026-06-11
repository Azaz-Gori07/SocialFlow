export interface User {
  _id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: string;
}

export type SocialPlatform = 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok';

export interface SocialAccount {
  _id: string;
  userId: string;
  platform: SocialPlatform;
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

export type PostStatus = 'pending' | 'scheduled' | 'published' | 'failed';

export interface Post {
  _id: string;
  userId: string;
  platforms: SocialPlatform[];
  content: string; // fallback/default content
  platformContent?: Partial<Record<SocialPlatform, string>>; // platform optimized content
  media?: string[]; // array of media URLs or local paths
  status: PostStatus;
  scheduledAt?: string; // ISO date string
  publishedAt?: string; // ISO date string
  createdAt: string;
  failedReason?: string;
}

export type CommentStatus = 'unresolved' | 'resolved';

export interface Comment {
  _id: string;
  platform: SocialPlatform;
  accountId: string; // which social channel this belongs to
  postId: string; // platform specific post ID
  postTitle?: string; // title/preview of the post
  author: {
    username: string;
    avatarUrl?: string;
    displayName?: string;
  };
  message: string;
  status: CommentStatus;
  assignedTo?: string; // userId of workspace member assigned
  createdAt: string;
  replies?: CommentReply[];
}

export interface CommentReply {
  _id: string;
  author: {
    username: string;
    avatarUrl?: string;
    displayName?: string;
    isSystemUser: boolean;
  };
  message: string;
  createdAt: string;
}

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

export interface AIGeneration {
  _id: string;
  userId: string;
  prompt: string;
  outputs: Partial<Record<SocialPlatform, string>>;
  createdAt: string;
}

export interface AnalyticsMetric {
  _id: string;
  userId: string;
  accountId: string; // which social account
  platform: SocialPlatform;
  date: string; // YYYY-MM-DD
  followers: number;
  reach: number;
  impressions: number;
  engagement: number;
  watchTime: number; // in seconds
  clicks: number;
  ctr: number; // ratio
  createdAt: string;
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: 'post_published' | 'post_failed' | 'new_comment' | 'workspace_invite' | 'insight';
  createdAt: string;
}

export interface ActivityLog {
  _id: string;
  userId: string;
  workspaceId?: string;
  action: string; // e.g. "POST_SCHEDULED", "ACCOUNT_CONNECTED"
  details: string;
  createdAt: string;
}

export interface GrowthInsight {
  _id: string;
  userId: string;
  title: string;
  recommendation: string;
  platform?: SocialPlatform;
  metricImpact?: string; // e.g., "2.3x more engagement"
  createdAt: string;
}
