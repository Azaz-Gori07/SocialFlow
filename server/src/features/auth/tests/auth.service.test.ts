import { AuthService } from '../auth.service';
import { UserRepository } from '../../user/user.repository';
import { OtpService } from '../otp.service';
import { AppError } from '../../../shared/errors/appError';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

jest.mock('../../user/user.repository');
jest.mock('../otp.service');
jest.mock('bcryptjs');

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
      ).rejects.toThrow(new AppError('User with this email already exists', 409));
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

    it('should throw AppError unauthorized if user not found', async () => {
      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@socialflow.ai',
          password: 'password123'
        })
      ).rejects.toThrow(new AppError('Invalid email or password', 401));
    });

    it('should throw AppError unauthorized if password does not match', async () => {
      mockUserRepository.findByEmail.mockResolvedValue({ ...mockUser, emailVerified: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@socialflow.ai',
          password: 'wrongpassword'
        })
      ).rejects.toThrow(new AppError('Invalid email or password', 401));
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
