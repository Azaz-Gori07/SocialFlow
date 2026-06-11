"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_service_1 = require("../auth.service");
const user_repository_1 = require("../../user/user.repository");
const appError_1 = require("../../../shared/errors/appError");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
jest.mock('../../user/user.repository');
jest.mock('bcryptjs');
describe('AuthService Unit Tests', () => {
    let authService;
    let mockUserRepository;
    const mockUser = {
        _id: 'user_123',
        email: 'test@socialflow.ai',
        passwordHash: 'hashed_pw',
        fullName: 'Test User',
        avatarUrl: 'http://avatar.com',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    beforeEach(() => {
        mockUserRepository = new user_repository_1.UserRepository();
        authService = new auth_service_1.AuthService(mockUserRepository);
        jest.clearAllMocks();
    });
    describe('register', () => {
        it('should register a new user successfully', async () => {
            mockUserRepository.findByEmail.mockResolvedValue(null);
            bcryptjs_1.default.genSalt.mockResolvedValue('salt');
            bcryptjs_1.default.hash.mockResolvedValue('hashed_pw');
            mockUserRepository.create.mockResolvedValue(mockUser);
            const result = await authService.register({
                email: 'test@socialflow.ai',
                password: 'password123',
                fullName: 'Test User'
            });
            expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@socialflow.ai');
            expect(mockUserRepository.create).toHaveBeenCalled();
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user).toEqual(mockUser);
        });
        it('should throw AppError conflict if email already exists', async () => {
            mockUserRepository.findByEmail.mockResolvedValue(mockUser);
            await expect(authService.register({
                email: 'test@socialflow.ai',
                password: 'password123',
                fullName: 'Test User'
            })).rejects.toThrow(new appError_1.AppError('User with this email already exists', 409));
        });
    });
    describe('login', () => {
        it('should login successfully with valid credentials', async () => {
            mockUserRepository.findByEmail.mockResolvedValue(mockUser);
            bcryptjs_1.default.compare.mockResolvedValue(true);
            const result = await authService.login({
                email: 'test@socialflow.ai',
                password: 'password123'
            });
            expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@socialflow.ai');
            expect(result).toHaveProperty('accessToken');
            expect(result.user).toEqual(mockUser);
        });
        it('should throw AppError unauthorized if user not found', async () => {
            mockUserRepository.findByEmail.mockResolvedValue(null);
            await expect(authService.login({
                email: 'nonexistent@socialflow.ai',
                password: 'password123'
            })).rejects.toThrow(new appError_1.AppError('Invalid email or password', 401));
        });
        it('should throw AppError unauthorized if password does not match', async () => {
            mockUserRepository.findByEmail.mockResolvedValue(mockUser);
            bcryptjs_1.default.compare.mockResolvedValue(false);
            await expect(authService.login({
                email: 'test@socialflow.ai',
                password: 'wrongpassword'
            })).rejects.toThrow(new appError_1.AppError('Invalid email or password', 401));
        });
    });
});
