"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const provider_factory_1 = require("../../services/social/providers/provider.factory");
const encryption_adapter_1 = require("../../services/social/adapters/encryption.adapter");
const appError_1 = require("../../shared/errors/appError");
class SocialService {
    socialRepository;
    constructor(socialRepository) {
        this.socialRepository = socialRepository;
    }
    /**
     * Generates authorization URL for a social platform connection
     */
    async getConnectUrl(platform, userId, redirectHost) {
        const provider = provider_factory_1.ProviderFactory.getProvider(platform);
        // Create encrypted state containing userId, nonce and timestamp
        const statePayload = {
            userId,
            nonce: crypto_1.default.randomBytes(16).toString('hex'),
            timestamp: Date.now()
        };
        const state = encryption_adapter_1.EncryptionAdapter.encrypt(JSON.stringify(statePayload));
        const redirectUri = this.getRedirectUri(platform, redirectHost);
        return provider.getAuthorizationUrl(state, redirectUri);
    }
    /**
     * Handles callback from social OAuth provider, exchanging code for tokens and creating/updating account
     */
    async handleCallback(platform, code, state, redirectHost) {
        // 1. Verify and decrypt state
        const { userId } = this.verifyState(state);
        const provider = provider_factory_1.ProviderFactory.getProvider(platform);
        const redirectUri = this.getRedirectUri(platform, redirectHost);
        // 2. Exchange authorization code for tokens (passing state for PKCE verifier lookup)
        const tokens = await provider.exchangeCode(code, redirectUri, state);
        // 3. Fetch platform profile
        const profile = await provider.getUserProfile(tokens.accessToken);
        // 4. Encrypt sensitive tokens for DB storage
        const encryptedAccessToken = encryption_adapter_1.EncryptionAdapter.encrypt(tokens.accessToken);
        const encryptedRefreshToken = tokens.refreshToken
            ? encryption_adapter_1.EncryptionAdapter.encrypt(tokens.refreshToken)
            : undefined;
        // 5. Check if account is already connected
        const existingAccount = await this.socialRepository.findAccountByPlatformAndAccountId(userId, platform, profile.accountId);
        let account;
        const accountData = {
            userId,
            platform: platform,
            accountId: profile.accountId,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            expiresAt: tokens.expiresAt,
            metadata: existingAccount?.metadata || {
                followerCount: Math.floor(Math.random() * 50000) + 1200,
                verified: Math.random() > 0.7
            }
        };
        if (existingAccount) {
            // Update existing connection
            const updated = await this.socialRepository.updateAccount(existingAccount._id.toString(), accountData);
            if (!updated) {
                throw appError_1.AppError.internal('Failed to update connected account info');
            }
            account = updated;
        }
        else {
            // Save new connected account
            account = await this.socialRepository.createAccount(accountData);
        }
        return account;
    }
    /**
     * Retrieves list of social accounts for a user
     */
    async getAccounts(userId) {
        return this.socialRepository.findAccountsByUserId(userId);
    }
    /**
     * Disconnects and purges a social account connection
     */
    async disconnectAccount(id, userId) {
        const account = await this.socialRepository.findAccountById(id);
        if (!account) {
            throw appError_1.AppError.notFound('Social account not found');
        }
        if (account.userId !== userId) {
            throw appError_1.AppError.forbidden('Unauthorized access to this social account connection');
        }
        await this.socialRepository.deleteAccount(id);
        // Cascade delete associated analytics and comments
        await this.socialRepository.deleteCascadeData(id);
    }
    // --- Helper Methods ---
    verifyState(state) {
        try {
            const decrypted = encryption_adapter_1.EncryptionAdapter.decrypt(state);
            const payload = JSON.parse(decrypted);
            // Expiry validation: state payload is valid for 15 minutes
            if (Date.now() - payload.timestamp > 15 * 60 * 1000) {
                throw new Error('OAuth state has expired');
            }
            return { userId: payload.userId };
        }
        catch (error) {
            throw appError_1.AppError.badRequest(`OAuth security validation failed: ${error.message}`);
        }
    }
    getRedirectUri(platform, redirectHost) {
        return `${redirectHost}/api/social/callback/${platform}`;
    }
}
exports.SocialService = SocialService;
exports.default = SocialService;
