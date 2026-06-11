import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { UserRepository } from '../user/user.repository';
import { OtpService } from './otp.service';
import { AppError } from '../../shared/errors/appError';
import { env } from '../../shared/config/env.config';
import { RegisterInput, LoginInput } from './auth.validation';

interface TokenPayload {
  id: string;
  email: string;
}

export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private otpService: OtpService,
    private createDefaultWorkspaceCallback?: (userId: string, name: string) => Promise<any>
  ) {}

  private requireDb(): void {
    if (mongoose.connection.readyState !== 1) {
      throw AppError.internal('Database unavailable — authentication cannot proceed');
    }
  }

  async register(input: RegisterInput) {
    this.requireDb();

    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

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
      workspace = await this.createDefaultWorkspaceCallback(
        user._id.toString(),
        `${user.fullName}'s Workspace`
      );
    }

    await this.otpService.generateAndSendOtp(
      user._id.toString(),
      user.email,
      'account_activation'
    );

    return {
      userId: user._id.toString(),
      email: user.email,
      workspace
    };
  }

  async verifyAccount(userId: string, code: string) {
    this.requireDb();

    const isValid = await this.otpService.verifyOtp(userId, code, 'account_activation');
    if (!isValid) {
      throw AppError.badRequest('Invalid or expired OTP');
    }

    const user = await this.userRepository.update(userId, {
      emailVerified: true,
      otpVerifiedAt: new Date()
    });
    if (!user) {
      throw AppError.notFound('User not found');
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

  async login(input: LoginInput) {
    this.requireDb();

    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }
    if (!user.passwordHash) {
      throw AppError.unauthorized('This account uses OAuth — sign in with Google or GitHub');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw AppError.unauthorized('Account not activated — verify your email first');
    }

    // Generate and send login OTP
    await this.otpService.generateAndSendOtp(
      user._id.toString(),
      user.email,
      'login'
    );

    return {
      userId: user._id.toString(),
      email: user.email
    };
  }

  async verifyLoginOtp(userId: string, code: string) {
    this.requireDb();

    const isValid = await this.otpService.verifyOtp(userId, code, 'login');
    if (!isValid) {
      throw AppError.badRequest('Invalid or expired OTP');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
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

  async refreshTokens(refreshToken: string) {
    this.requireDb();

    try {
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as TokenPayload;
      const user = await this.userRepository.findById(decoded.id);
      if (!user) {
        throw AppError.unauthorized('Invalid session');
      }

      user.lastLogin = new Date();
      await user.save();

      const tokens = this.generateTokens({ id: user._id.toString(), email: user.email });
      return tokens;
    } catch (err) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
  }

  async getProfile(userId: string) {
    this.requireDb();

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
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

  async handleOAuthCallback(provider: string, code: string, state: string | undefined, zenuxsOAuthService: any) {
    this.requireDb();

    const { user, isNew } = await zenuxsOAuthService.handleCallback(provider, code, state);

    let workspace = null;
    if (isNew && this.createDefaultWorkspaceCallback) {
      workspace = await this.createDefaultWorkspaceCallback(
        user._id.toString(),
        `${user.fullName}'s Workspace`
      );
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

  private generateTokens(payload: TokenPayload) {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
    return { accessToken, refreshToken, expiresIn: 900 };
  }
}

export default AuthService;
