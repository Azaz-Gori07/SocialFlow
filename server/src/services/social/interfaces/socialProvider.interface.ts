import type { SocialPlatform, AccountType } from '../../../types';

/**
 * Normalized capability layer (guideline §16).
 * The UI must adapt dynamically to these — never render unsupported actions.
 */
export interface ProviderCapabilities {
  readProfile: boolean;
  readPosts: boolean;
  createPost: boolean;
  deletePost: boolean;
  updatePost: boolean;
  uploadImage: boolean;
  uploadVideo: boolean;
  carousel: boolean;
  stories: boolean;
  reels: boolean;
  commentsRead: boolean;
  commentsWrite: boolean;
  insights: boolean;
  messaging: boolean;
  webhooks: boolean;
}

/** Media kinds a provider account can attach to a post. */
export type MediaKind = 'image' | 'video' | 'text';

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until expiry, as returned by the provider. */
  expiresIn?: number;
  /** ISO timestamp computed from expiresIn. */
  expiresAt?: string;
}

/** User-level identity returned by the provider's userinfo/identity endpoint. */
export interface AuthenticatedIdentity {
  /** Provider user-level account id (e.g. Meta user id, X user id, LinkedIn person urn). */
  externalAccountId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  /** Scopes granted at the user level. */
  scopes: string[];
}

/** One selectable/connected account under a user-level connection. */
export interface ProviderAccount {
  /** Provider-assigned account id (page id, ig user id, user id, org urn). */
  providerAccountId: string;
  /** Parent entity: the Facebook Page behind an Instagram business account. */
  providerParentAccountId?: string;
  accountType: AccountType;
  username: string;
  displayName: string;
  avatarUrl?: string;
  /** Account-level access token when the provider grants one (e.g. Meta page tokens). */
  accountToken?: string;
  /** Computed per account; providers must not rely on it being set on input. */
  capabilities?: ProviderCapabilities;
}

export interface PublishContext {
  tokens: AuthTokens;
  account: ProviderAccount;
}

export interface MediaItem {
  /** Public URL of the media file. */
  url: string;
  kind: 'image' | 'video';
  alt?: string;
}

export interface UploadedMedia {
  /** Provider-side asset reference (e.g. LinkedIn asset urn, X media id). */
  externalMediaId?: string;
  /** Provider-specific extra state (e.g. IG container id). */
  metadata?: Record<string, any>;
}

export interface PublishResult {
  /** Provider-assigned post id. Never fabricated. */
  externalPostId: string;
  /** Public URL of the published post when the provider exposes one. */
  externalPostUrl?: string;
  /** Extra provider state (e.g. IG container id). */
  metadata?: Record<string, any>;
}

export interface ProviderPost {
  externalPostId: string;
  message?: string;
  media?: MediaItem[];
  createdAt?: string;
  url?: string;
  raw?: Record<string, any>;
}

export interface ProviderComment {
  externalCommentId: string;
  author: { username: string; displayName?: string; avatarUrl?: string };
  message: string;
  createdAt?: string;
  /** Set for replies to another comment. */
  parentExternalCommentId?: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface InsightsData {
  /** YYYY-MM-DD. */
  date: string;
  followers?: number;
  reach?: number;
  impressions?: number;
  engagement?: number;
  clicks?: number;
  raw?: Record<string, any>;
}

export interface ProviderValidationResult {
  healthy: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Common provider contract (guideline §6).
 * Provider-specific differences live inside each adapter — never in controllers.
 */
export interface SocialProvider {
  readonly platform: SocialPlatform;
  /** Provider family used for credential lookup. */
  readonly provider: 'meta' | 'twitter' | 'linkedin' | 'google';
  /** True when the provider's client credentials are configured in env. */
  isConfigured(): boolean;

  getAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
    scopes?: string[];
    /** PKCE S256 challenge (verifier is stored server-side in the OAuth transaction). */
    codeChallenge?: string;
  }): string;

  exchangeCode(params: { code: string; redirectUri: string; codeVerifier?: string }): Promise<AuthTokens>;

  refreshAccessToken(refreshToken: string): Promise<AuthTokens>;

  /** User-level identity + granted scopes. */
  getAuthenticatedIdentity(tokens: AuthTokens): Promise<AuthenticatedIdentity>;

  /** All accounts reachable with these tokens. */
  discoverAccounts(tokens: AuthTokens): Promise<ProviderAccount[]>;

  /** Exact capabilities for one account. */
  getCapabilities(account: ProviderAccount): ProviderCapabilities;

  /** Checks token/account health against the provider. */
  validateConnection(tokens: AuthTokens, account: ProviderAccount): Promise<ProviderValidationResult>;

  /** Media upload happens before createPost for providers that need it. */
  uploadMedia?(ctx: PublishContext, media: MediaItem): Promise<UploadedMedia>;

  createPost(ctx: PublishContext, input: { content: string; media?: MediaItem[] }): Promise<PublishResult>;

  getPost?(ctx: PublishContext, externalPostId: string): Promise<ProviderPost>;

  listPosts?(ctx: PublishContext, params: { cursor?: string; limit?: number }): Promise<Paginated<ProviderPost>>;

  deletePost?(ctx: PublishContext, externalPostId: string): Promise<void>;

  getInsights?(ctx: PublishContext, range: { startDate: string; endDate: string }): Promise<InsightsData[]>;

  listComments?(
    ctx: PublishContext,
    params: { externalPostId?: string; cursor?: string; limit?: number }
  ): Promise<Paginated<ProviderComment>>;

  replyToComment?(ctx: PublishContext, externalCommentId: string, message: string): Promise<{ externalReplyId: string }>;

  /** Best-effort URL builder for a post id. */
  resolvePostUrl?(externalPostId: string, account: ProviderAccount): string | undefined;
}

export default SocialProvider;
