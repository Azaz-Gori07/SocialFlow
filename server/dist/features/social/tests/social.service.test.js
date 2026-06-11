"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const social_service_1 = require("../social.service");
const social_repository_1 = require("../social.repository");
const encryption_adapter_1 = require("../../../services/social/adapters/encryption.adapter");
const appError_1 = require("../../../shared/errors/appError");
const mongoose_1 = __importStar(require("mongoose"));
// Mock schema registration for unit testing simulation data
if (!mongoose_1.default.models.AnalyticsMetric) {
    mongoose_1.default.model('AnalyticsMetric', new mongoose_1.Schema({}));
}
if (!mongoose_1.default.models.Comment) {
    mongoose_1.default.model('Comment', new mongoose_1.Schema({}));
}
jest.mock('../social.repository');
describe('SocialService Unit Tests', () => {
    let socialService;
    let mockSocialRepository;
    const mockUserId = 'user_alex_123';
    const mockAccountId = 'act_mock_twitter_1234';
    const mockSocialAccount = {
        _id: 'sa_999',
        userId: mockUserId,
        platform: 'twitter',
        accountId: mockAccountId,
        username: 'alex_creator',
        displayName: 'Alex Creator',
        avatarUrl: 'http://avatar.com',
        accessToken: encryption_adapter_1.EncryptionAdapter.encrypt('mock_access_token'),
        refreshToken: encryption_adapter_1.EncryptionAdapter.encrypt('mock_refresh_token'),
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        metadata: { followerCount: 1500 }
    };
    beforeEach(() => {
        mockSocialRepository = new social_repository_1.SocialRepository();
        socialService = new social_service_1.SocialService(mockSocialRepository);
        jest.spyOn(mongoose_1.default.Model.prototype, 'save').mockResolvedValue(undefined);
        jest.clearAllMocks();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    describe('getConnectUrl', () => {
        it('should generate a valid authorization URL for twitter containing encrypted state', async () => {
            const url = await socialService.getConnectUrl('twitter', mockUserId, 'http://localhost:5000');
            expect(url).toBeDefined();
            expect(url.includes('https://twitter.com/i/oauth2/authorize') || url.includes('/callback/twitter')).toBe(true);
            const parsedUrl = new URL(url);
            const state = parsedUrl.searchParams.get('state');
            expect(state).toBeTruthy();
            // Decrypt state to verify contents
            const decrypted = encryption_adapter_1.EncryptionAdapter.decrypt(state);
            const payload = JSON.parse(decrypted);
            expect(payload.userId).toBe(mockUserId);
            expect(payload.nonce).toBeDefined();
        });
    });
    describe('handleCallback', () => {
        it('should exchange code and create a new social account if it does not exist', async () => {
            const statePayload = {
                userId: mockUserId,
                nonce: 'randomnonce123',
                timestamp: Date.now()
            };
            const state = encryption_adapter_1.EncryptionAdapter.encrypt(JSON.stringify(statePayload));
            mockSocialRepository.findAccountByPlatformAndAccountId.mockResolvedValue(null);
            mockSocialRepository.createAccount.mockResolvedValue(mockSocialAccount);
            const result = await socialService.handleCallback('twitter', 'mock_auth_code_123', state, 'http://localhost:5000');
            expect(mockSocialRepository.findAccountByPlatformAndAccountId).toHaveBeenCalledWith(mockUserId, 'twitter', expect.stringContaining('act_mock_twitter_'));
            expect(mockSocialRepository.createAccount).toHaveBeenCalled();
            expect(result).toBe(mockSocialAccount);
        });
        it('should throw AppError badRequest if state has expired', async () => {
            const statePayload = {
                userId: mockUserId,
                nonce: 'randomnonce123',
                timestamp: Date.now() - 20 * 60 * 1000 // 20 minutes ago (expired)
            };
            const state = encryption_adapter_1.EncryptionAdapter.encrypt(JSON.stringify(statePayload));
            await expect(socialService.handleCallback('twitter', 'code123', state, 'http://localhost:5000')).rejects.toThrow(appError_1.AppError);
        });
    });
    describe('getAccounts', () => {
        it('should retrieve connected accounts list for user', async () => {
            mockSocialRepository.findAccountsByUserId.mockResolvedValue([mockSocialAccount]);
            const result = await socialService.getAccounts(mockUserId);
            expect(mockSocialRepository.findAccountsByUserId).toHaveBeenCalledWith(mockUserId);
            expect(result.length).toBe(1);
            expect(result[0]).toBe(mockSocialAccount);
        });
    });
    describe('disconnectAccount', () => {
        it('should disconnect account and trigger cascade cleanup if owner matches', async () => {
            mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);
            mockSocialRepository.deleteAccount.mockResolvedValue(true);
            mockSocialRepository.deleteCascadeData.mockResolvedValue(undefined);
            await socialService.disconnectAccount('sa_999', mockUserId);
            expect(mockSocialRepository.findAccountById).toHaveBeenCalledWith('sa_999');
            expect(mockSocialRepository.deleteAccount).toHaveBeenCalledWith('sa_999');
            expect(mockSocialRepository.deleteCascadeData).toHaveBeenCalledWith('sa_999');
        });
        it('should throw forbidden AppError if user does not own the connection', async () => {
            mockSocialRepository.findAccountById.mockResolvedValue(mockSocialAccount);
            await expect(socialService.disconnectAccount('sa_999', 'wrong_user_id')).rejects.toThrow(new appError_1.AppError('Unauthorized access to this social account connection', 403));
        });
    });
});
