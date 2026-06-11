export interface UserProfile {
  accountId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
}

export interface TokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
}

export interface SocialProvider {
  /**
   * Generates authorization URL for OAuth 2.0 flow
   * @param state Cryptographically secure state string containing encrypted contexts
   * @param redirectUri Dynamic redirect callback URI
   */
  getAuthorizationUrl(state: string, redirectUri: string): string;

  /**
   * Exchanges authorization code for credentials
   * @param code Code returned from platform
   * @param redirectUri Redirect URI matching original request
   * @param state Optional state string for PKCE verifier lookup
   */
  exchangeCode(code: string, redirectUri: string, state?: string): Promise<TokenPayload>;

  /**
   * Retrieves profile details using credentials
   * @param accessToken Access token
   */
  getUserProfile(accessToken: string): Promise<UserProfile>;

  /**
   * Refreshes credentials using refresh token
   * @param refreshToken Refresh token
   */
  refreshToken(refreshToken: string): Promise<TokenPayload>;

  /**
   * Publishes content to the social media platform
   * @param accessToken Decrypted access token
   * @param content Text content of the post
   * @param media Optional array of media attachment URLs
   * @param accountId Optional platform account ID (used by providers like LinkedIn that need author URN)
   * @returns Platform-specific ID of the published post
   */
  publishPost(accessToken: string, content: string, media?: string[], accountId?: string): Promise<string>;
}
export default SocialProvider;
