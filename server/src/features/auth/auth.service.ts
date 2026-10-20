import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { UserRepository } from '../user/user.repository';
import { OtpService } from './otp.service';
import { AppError } from '../../shared/errors/appError';
import { env } from '../../shared/config/env.config';
import { db } from '../../database/db';
import { RegisterInput, LoginInput } from './auth.validation';

interface TokenPayload {
  id: string;
  email: string;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Multi-tab refresh grace: tabs racing on the same just-rotated token get a
// fresh rotation instead of a hard logout. Enemies paused for >60s do not.
const ROTATION_GRACE_MS = 60 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      throw AppError.conflict('This email is already registered. Please sign in instead.');
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

    const tokens = await this.generateTokens({ id: user._id.toString(), email: user.email });

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
      throw AppError.notFound('No account found with this email. Please sign up first.');
    }
    if (!user.passwordHash) {
      throw AppError.unauthorized('This account uses OAuth — sign in with Google or GitHub');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw AppError.unauthorized('Incorrect password. Please try again or reset it.');
    }

    if (!user.emailVerified) {
      throw AppError.unauthorized('Account not activated — verify your email first');
    }

    user.lastLogin = new Date();
    await user.save();

    const tokens = await this.generateTokens({ id: user._id.toString(), email: user.email });

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

  async verifyLoginOtp(userId: string, code: string) {
    this.requireDb();

    const isValid = await this.otpService.verifyOtp(userId, code, 'account_activation');
    if (!isValid) {
      throw AppError.badRequest('Invalid or expired OTP');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    user.lastLogin = new Date();
    await user.save();

    const tokens = await this.generateTokens({ id: user._id.toString(), email: user.email });

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
      const tokenHash = hashToken(refreshToken);

      // Rotation + revocation: the presented token must exist, be unrevoked,
      // and unexpired. It is revoked and replaced by a fresh token.
      const stored = await db.refreshTokens.findOne({ tokenHash });
      if (!stored) {
        throw AppError.unauthorized('Invalid session');
      }
      if (stored.expiresAt && new Date(stored.expiresAt).getTime() < Date.now()) {
        throw AppError.unauthorized('Session expired');
      }
      if (stored.revokedAt) {
        // Single-use rotation races between tabs: when a token was rotated
        // moments ago (another tab holding the same session refreshed first),
        // rotating again is harmless; past the grace window a reuse means a
        // replayed token and must be refused. Logouts are always final.
        const isLogout = (stored as { revokedByLogout?: boolean }).revokedByLogout === true;
        const revokedAge = Date.now() - new Date(stored.revokedAt).getTime();
        if (isLogout || revokedAge > ROTATION_GRACE_MS) {
          throw AppError.unauthorized('Session expired');
        }
      }

      const user = await this.userRepository.findById(decoded.id);
      if (!user) {
        throw AppError.unauthorized('Invalid session');
      }

      await db.refreshTokens.updateOne(
        { _id: stored._id },
        { $set: { revokedAt: new Date() } }
      );

      user.lastLogin = new Date();
      await user.save();

      return await this.generateTokens({ id: user._id.toString(), email: user.email }, tokenHash);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('Invalid or expired refresh token');
    }
  }

  /** Revoke a refresh token (logout). Idempotent for unknown tokens. */
  async logout(refreshToken?: string) {
    this.requireDb();
    if (!refreshToken) return;
    await db.refreshTokens.updateOne(
      { tokenHash: hashToken(refreshToken) },
      { $set: { revokedAt: new Date(), revokedByLogout: true } }
    );
  }

  async logoutAll(userId: string) {
    this.requireDb();
    const result = await db.refreshTokens.updateMany(
      // Active tokens can have no revokedAt field or an explicit null.
      { userId, $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }] },
      { $set: { revokedAt: new Date(), revokedByLogout: true } }
    );
    return { revoked: (result as any)?.modifiedCount ?? 0 };
  }

  /**
   * Issue a one-time, short-lived code that can be exchanged for tokens.
   * Used by the OAuth callback so tokens never appear in the redirect URL.
   */
  async issueAuthCode(userId: string): Promise<string> {
    this.requireDb();
    const code = randomBytes(32).toString('hex');
    await db.authCodes.create({
      userId,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    });
    return code;
  }

  /** Exchange a one-time code for fresh tokens. Single use. */
  async exchangeAuthCode(code: string) {
    this.requireDb();

    const stored = await db.authCodes.findOne({ codeHash: hashToken(code) });
    if (!stored || stored.usedAt) {
      throw AppError.unauthorized('Invalid or already-used code');
    }
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      throw AppError.unauthorized('Code expired');
    }

    await db.authCodes.updateOne({ _id: stored._id }, { $set: { usedAt: new Date() } });

    const user = await this.userRepository.findById(stored.userId);
    if (!user) {
      throw AppError.unauthorized('Invalid session');
    }

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        provider: user.provider
      },
      ...(await this.generateTokens({ id: user._id.toString(), email: user.email }))
    };
  }

  /** Step 1 of password reset: mail an OTP if the account exists.
   *  Response is identical whether or not the email is registered — the
   *  userId is only echoed back when an OTP was actually issued, and the
   *  client uses that to move to step 2. */
  async forgotPassword(email: string) {
    this.requireDb();

    const user = await this.userRepository.findByEmail(email);
    if (user && user.passwordHash) {
      await this.otpService.generateAndSendOtp(
        user._id.toString(),
        user.email,
        'password_reset'
      );
      return { userId: user._id.toString(), email: user.email };
    }
    // OAuth-only accounts have no local password to reset.
    return null;
  }

  /** Step 2: verify the OTP and set the new password. Revokes every
   *  existing refresh token so hijacked sessions die with the old password. */
  async resetPassword(userId: string, code: string, newPassword: string) {
    this.requireDb();

    const isValid = await this.otpService.verifyOtp(userId, code, 'password_reset');
    if (!isValid) {
      throw AppError.badRequest('Invalid or expired OTP');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    await db.refreshTokens.updateMany(
      { userId },
      { $set: { revokedAt: new Date(), revokedByLogout: true } }
    );

    return { email: user.email };
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

  async updateProfile(userId: string, input: { fullName?: string; avatarUrl?: string }) {
    this.requireDb();

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const patch: Record<string, unknown> = {};
    if (input.fullName !== undefined) patch.fullName = input.fullName.trim();
    if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

    await this.userRepository.update(userId, patch as any);
    return this.getProfile(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    this.requireDb();

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    if (!user.passwordHash) {
      throw AppError.badRequest('This account uses a social sign-in and has no password to change');
    }
    if (currentPassword === newPassword) {
      throw AppError.badRequest('New password must be different from the current password');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw AppError.badRequest('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(userId, { passwordHash });

    // A password change invalidates every other session. Mint a fresh pair for
    // the caller so the tab that performed the change stays signed in.
    await db.refreshTokens.updateMany(
      { userId: user._id.toString(), $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }] },
      { $set: { revokedAt: new Date(), revokedByLogout: true } }
    );

    return this.generateTokens({ id: user._id.toString(), email: user.email });
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

    const tokens = await this.generateTokens({ id: user._id.toString(), email: user.email });

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
      code: await this.issueAuthCode(user._id.toString()),
    };
  }

  private async generateTokens(payload: TokenPayload, rotatedFrom?: string) {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
    // jti: JWT iat has 1s granularity, so same-payload tokens minted in the
    // same second are byte-identical → duplicate tokenHash → E11000 on the
    // unique refreshtokens index.
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: '30d',
      jwtid: randomBytes(16).toString('hex'),
    });

    await db.refreshTokens.create({
      userId: payload.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      rotatedFrom,
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }
}

export default AuthService;
