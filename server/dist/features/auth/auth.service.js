"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const appError_1 = require("../../shared/errors/appError");
const env_config_1 = require("../../shared/config/env.config");
class AuthService {
    userRepository;
    otpService;
    createDefaultWorkspaceCallback;
    constructor(userRepository, otpService, createDefaultWorkspaceCallback) {
        this.userRepository = userRepository;
        this.otpService = otpService;
        this.createDefaultWorkspaceCallback = createDefaultWorkspaceCallback;
    }
    requireDb() {
        if (mongoose_1.default.connection.readyState !== 1) {
            throw appError_1.AppError.internal('Database unavailable — authentication cannot proceed');
        }
    }
    async register(input) {
        this.requireDb();
        const existing = await this.userRepository.findByEmail(input.email);
        if (existing) {
            throw appError_1.AppError.conflict('User with this email already exists');
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(input.password, salt);
        const user = await this.userRepository.create({
            email: input.email.toLowerCase(),
            passwordHash,
            fullName: input.fullName,
            provider: 'local',
            emailVerified: false,
            avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(input.fullName)}`
        });
        let workspace = null;
        if (this.createDefaultWorkspaceCallback) {
            workspace = await this.createDefaultWorkspaceCallback(user._id.toString(), `${user.fullName}'s Workspace`);
        }
        await this.otpService.generateAndSendOtp(user._id.toString(), user.email, 'account_activation');
        return {
            userId: user._id.toString(),
            email: user.email,
            workspace
        };
    }
    async verifyAccount(userId, code) {
        this.requireDb();
        const isValid = await this.otpService.verifyOtp(userId, code, 'account_activation');
        if (!isValid) {
            throw appError_1.AppError.badRequest('Invalid or expired OTP');
        }
        const user = await this.userRepository.update(userId, {
            emailVerified: true,
            otpVerifiedAt: new Date()
        });
        if (!user) {
            throw appError_1.AppError.notFound('User not found');
        }
        // Generate tokens so user is logged in after account activation
        user.lastLogin = new Date();
        await user.save();
        const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
        return {
            user: {
                id: user._id.toString(),
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                provider: user.provider
            },
            message: 'Account activated successfully',
            ...tokens
        };
    }
    async login(input) {
        this.requireDb();
        const user = await this.userRepository.findByEmail(input.email);
        if (!user) {
            throw appError_1.AppError.unauthorized('Invalid email or password');
        }
        if (!user.passwordHash) {
            throw appError_1.AppError.unauthorized('This account uses OAuth — sign in with Google or GitHub');
        }
        const isMatch = await bcryptjs_1.default.compare(input.password, user.passwordHash);
        if (!isMatch) {
            throw appError_1.AppError.unauthorized('Invalid email or password');
        }
        if (!user.emailVerified) {
            throw appError_1.AppError.unauthorized('Account not activated — verify your email first');
        }
        // Directly return tokens without OTP requirement
        user.lastLogin = new Date();
        await user.save();
        const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
        return {
            user: {
                id: user._id.toString(),
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                provider: user.provider
            },
            ...tokens
        };
    }
    async verifyLoginOtp(userId, code) {
        this.requireDb();
        const isValid = await this.otpService.verifyOtp(userId, code, 'login');
        if (!isValid) {
            throw appError_1.AppError.badRequest('Invalid or expired OTP');
        }
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw appError_1.AppError.notFound('User not found');
        }
        user.lastLogin = new Date();
        await user.save();
        const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
        return {
            user: {
                id: user._id.toString(),
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                provider: user.provider
            },
            ...tokens
        };
    }
    async refreshTokens(refreshToken) {
        this.requireDb();
        try {
            const decoded = jsonwebtoken_1.default.verify(refreshToken, env_config_1.env.JWT_REFRESH_SECRET);
            const user = await this.userRepository.findById(decoded.id);
            if (!user) {
                throw appError_1.AppError.unauthorized('Invalid session');
            }
            user.lastLogin = new Date();
            await user.save();
            const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
            return tokens;
        }
        catch (err) {
            throw appError_1.AppError.unauthorized('Invalid or expired refresh token');
        }
    }
    async getProfile(userId) {
        this.requireDb();
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw appError_1.AppError.notFound('User not found');
        }
        return {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            provider: user.provider,
            emailVerified: user.emailVerified,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        };
    }
    async handleOAuthCallback(provider, code, state, zenuxsOAuthService) {
        this.requireDb();
        const { user, isNew } = await zenuxsOAuthService.handleCallback(provider, code, state);
        let workspace = null;
        if (isNew && this.createDefaultWorkspaceCallback) {
            workspace = await this.createDefaultWorkspaceCallback(user._id.toString(), `${user.fullName}'s Workspace`);
        }
        const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
        return {
            user: {
                id: user._id.toString(),
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                provider: user.provider
            },
            workspace,
            isNew,
            ...tokens
        };
    }
    generateTokens(payload) {
        const accessToken = jsonwebtoken_1.default.sign(payload, env_config_1.env.JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jsonwebtoken_1.default.sign(payload, env_config_1.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
        return { accessToken, refreshToken, expiresIn: 900 };
    }
}
exports.AuthService = AuthService;
exports.default = AuthService;
