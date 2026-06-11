"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshSchema = exports.loginSchema = exports.verifyOtpSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters long'),
    fullName: zod_1.z.string().min(2, 'Name must be at least 2 characters long')
});
exports.verifyOtpSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1, 'User ID is required'),
    code: zod_1.z.string().length(8, 'OTP must be exactly 8 digits'),
    purpose: zod_1.z.enum(['account_activation', 'login'])
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address format'),
    password: zod_1.z.string().min(1, 'Password is required')
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1, 'Refresh token is required')
});
