import { AuthService } from '../auth.service';
import { UserRepository } from '../../user/user.repository';
import { OtpService } from '../otp.service';
import { AppError } from '../../../shared/errors/appError';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

jest.mock('../../user/user.repository');
jest.mock('../otp.service');
jest.mock('bcryptjs');
// Deterministic token persistence: never touches a real DB connection.
jest.mock('../../../database/db', () => ({
  db: {
    refreshTokens: {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 })
    },
    authCodes: {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockResolvedValue({})
    }
  }
}));

describe('AuthService Unit Tests', () => {
  let authService: AuthService;
  let mockUserRepository: jest.Mocked<UserRepository>;
  let mockOtpService: jest.Mocked<OtpService>;

  const mockUser: any = {
    _id: 'user_123',
    email: 'test@socialflow.ai',
    passwordHash: 'hashed_pw',
    fullName: 'Test User',
    provider: 'local',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(true)
  };

  const mockVerifiedUser: any = {
    ...mockUser,
    emailVerified: true,
    lastLogin: new Date()
  };

  beforeEach(() => {
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    mockOtpService = new OtpService({} as any) as jest.Mocked<OtpService>;
    authService = new AuthService(mockUserRepository, mockOtpService);
    jest.clearAllMocks();
    (mongoose.connection as any).readyState = 1;
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      mockUserRepository.create.mockResolvedValue(mockUser);
      mockOtpService.generateAndSendOtp.mockResolvedValue(undefined);

      const result = await authService.register({
        email: 'test@socialflow.ai',
        password: 'password123',
        fullName: 'Test User'
      });

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@socialflow.ai');
      expect(mockUserRepository.create).toHaveBeenCalled();
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('email');
      expect(result.email).toBe('test@socialflow.ai');
      expect(mockOtpService.generateAndSendOtp).toHaveBeenCalledWith(
        mockUser._id.toString(),
        mockUser.email,
        'account_activation'
      );
    });

    it('should throw AppError conflict if email already exists', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(
        authService.register({
          email: 'test@socialflow.ai',
          password: 'password123',
          fullName: 'Test User'
        })
      ).rejects.toThrow(new AppError('This email is already registered. Please sign in instead.', 409));
    });
  });

  describe('login', () => {
    it('should return tokens with valid credentials (no OTP)', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ ...mockUser, emailVerified: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@socialflow.ai',
        password: 'password123'
      });

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@socialflow.ai');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(result.user.email).toBe('test@socialflow.ai');
      expect(mockOtpService.generateAndSendOtp).not.toHaveBeenCalled();
    });

    it('should throw AppError not found if user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@socialflow.ai',
          password: 'password123'
        })
      ).rejects.toThrow(new AppError('No account found with this email. Please sign up first.', 404));
    });

    it('should throw AppError unauthorized if password does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ ...mockUser, emailVerified: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@socialflow.ai',
          password: 'wrongpassword'
        })
      ).rejects.toThrow(new AppError('Incorrect password. Please try again or reset it.', 401));
    });

    it('should throw AppError unauthorized if email not verified', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ ...mockUser, emailVerified: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        authService.login({
          email: 'test@socialflow.ai',
          password: 'password123'
        })
      ).rejects.toThrow(new AppError('Account not activated — verify your email first', 401));
    });
  });

  describe('updateProfile', () => {
    it('updates the name and returns the fresh profile', async () => {
      mockUserRepository.findById
        .mockResolvedValueOnce({ ...mockUser, save: jest.fn() })
        .mockResolvedValueOnce({ ...mockUser, fullName: 'New Name', save: jest.fn() });
      mockUserRepository.update.mockResolvedValue(undefined as any);

      const result = await authService.updateProfile('user_123', { fullName: 'New Name' });

      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', { fullName: 'New Name' });
      expect(result.fullName).toBe('New Name');
    });
  });

  describe('changePassword', () => {
    it('rejects an incorrect current password', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword('user_123', 'wrong-password', 'new-password-123')
      ).rejects.toThrow(new AppError('Current password is incorrect', 400));
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });

    it('rejects OAuth-only accounts that have no password', async () => {
      mockUserRepository.findById.mockResolvedValue({ ...mockUser, passwordHash: undefined });

      await expect(
        authService.changePassword('user_123', 'anything', 'new-password-123')
      ).rejects.toThrow('This account uses a social sign-in');
    });

    it('hashes the new password, revokes every other refresh token, and mints a fresh pair', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_pw');
      mockUserRepository.update.mockResolvedValue(undefined as any);

      const result = await authService.changePassword('user_123', 'current-password', 'new-password-123');

      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', { passwordHash: 'new_hashed_pw' });
      const { db } = require('../../../database/db');
      expect(db.refreshTokens.updateMany).toHaveBeenCalledWith(
        { userId: 'user_123', $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }] },
        expect.objectContaining({ $set: expect.objectContaining({ revokedByLogout: true }) })
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('logoutAll', () => {
    it('revokes every active refresh token for the user', async () => {
      const { db } = require('../../../database/db');
      (db.refreshTokens.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });
      const result = await authService.logoutAll('user_123');

      expect(db.refreshTokens.updateMany).toHaveBeenCalledWith(
        { userId: 'user_123', $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }] },
        expect.objectContaining({ $set: expect.objectContaining({ revokedByLogout: true }) })
      );
      expect(result.revoked).toBe(2);
    });
  });

  describe('verifyLoginOtp', () => {
    it('should issue JWT tokens after OTP verification', async () => {
      mockOtpService.verifyOtp.mockResolvedValue(true);
      mockUserRepository.findById.mockResolvedValue(mockVerifiedUser);

      const result = await authService.verifyLoginOtp('user_123', '12345678');

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith('user_123', '12345678', 'account_activation');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.user.email).toBe('test@socialflow.ai');
    });

    it('should throw badRequest if OTP is invalid', async () => {
      mockOtpService.verifyOtp.mockResolvedValue(false);

      await expect(
        authService.verifyLoginOtp('user_123', '00000000')
      ).rejects.toThrow(new AppError('Invalid or expired OTP', 400));
    });
  });

  describe('verifyAccount', () => {
    it('should activate account after OTP verification', async () => {
      mockOtpService.verifyOtp.mockResolvedValue(true);
      mockUserRepository.update.mockResolvedValue({ ...mockUser, emailVerified: true, otpVerifiedAt: new Date() });

      const result = await authService.verifyAccount('user_123', '12345678');

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith('user_123', '12345678', 'account_activation');
      expect(mockUserRepository.update).toHaveBeenCalledWith('user_123', {
        emailVerified: true,
        otpVerifiedAt: expect.any(Date)
      });
      expect(result.message).toBe('Account activated successfully');
    });
  });
});
