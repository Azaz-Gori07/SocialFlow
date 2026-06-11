"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
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
            // Seed simulation dashboard data for new account
            await this.seedSimulationData(userId, account._id.toString(), platform);
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
    /**
     * Seeds visual mock dashboard analytics & comments to provide realistic visuals
     */
    async seedSimulationData(userId, accountId, platform) {
        try {
            const AnalyticsModel = mongoose_1.default.models.AnalyticsMetric || mongoose_1.default.model('AnalyticsMetric');
            const CommentModel = mongoose_1.default.models.Comment || mongoose_1.default.model('Comment');
            // 1. Generate 14 days of history
            const today = new Date();
            for (let i = 14; i >= 0; i--) {
                const dateString = new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const randomModifier = Math.sin(i / 2) * 500 + (Math.random() * 200);
                const followerCount = Math.floor(10000 + (14 - i) * 150 + randomModifier);
                const reach = Math.floor(followerCount * 1.5 + (Math.random() * 5000));
                const impressions = Math.floor(reach * 2 + (Math.random() * 8000));
                const engagement = Math.floor(reach * 0.08 + (Math.random() * 400));
                const clicks = Math.floor(engagement * 0.15 + (Math.random() * 30));
                const record = new AnalyticsModel({
                    userId,
                    accountId,
                    platform,
                    date: dateString,
                    followers: followerCount,
                    reach,
                    impressions,
                    engagement,
                    watchTime: platform === 'youtube' ? Math.floor(reach * 0.5) : 0,
                    clicks,
                    ctr: impressions > 0 ? parseFloat((clicks / impressions).toFixed(4)) : 0
                });
                await record.save();
            }
            // 2. Generate starting simulation comments
            const seedComments = {
                twitter: [
                    'Wow, this tool looks super useful! Is there a free trial?',
                    'Can we schedule threads or just single posts?',
                    'I need this for my SaaS launch!'
                ],
                linkedin: [
                    'Brilliant execution on the MVP. Looking forward to see it scale.',
                    'How does this handle LinkedIn Carousel PDFs?',
                    'Insightful update. Shared with my team.'
                ],
                youtube: [
                    'Amazing walkthrough video!',
                    'Subbed. Can you do a tutorial on setting up OAuth connections?',
                    'The audio quality in this video is pristine. Content is gold!'
                ]
            };
            const platformComments = seedComments[platform] || ['Nice! Looks very promising.'];
            for (let j = 0; j < platformComments.length; j++) {
                const comment = new CommentModel({
                    platform,
                    accountId,
                    postId: 'pst_' + Math.random().toString(36).substring(2, 9),
                    postTitle: `Launch post for ${platform}`,
                    author: {
                        username: `user_${Math.floor(Math.random() * 1000)}`,
                        displayName: `Creator Fan ${j + 1}`,
                        avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=commenter_${platform}_${j}`
                    },
                    message: platformComments[j],
                    status: 'unresolved'
                });
                await comment.save();
            }
        }
        catch (error) {
            console.error(`[SocialService] Failed to seed simulation data for account ${accountId}:`, error);
        }
    }
}
exports.SocialService = SocialService;
exports.default = SocialService;
