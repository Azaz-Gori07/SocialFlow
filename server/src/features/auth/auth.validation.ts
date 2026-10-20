import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().min(2, 'Name must be at least 2 characters long')
});

export const verifyOtpSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  code: z.string().length(8, 'OTP must be exactly 8 digits'),
  purpose: z.enum(['account_activation'])
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required')
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export const exchangeCodeSchema = z.object({
  code: z.string().min(32, 'Invalid code')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address format')
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  code: z.string().length(8, 'OTP must be exactly 8 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ExchangeCodeInput = z.infer<typeof exchangeCodeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters long').max(80).optional(),
    avatarUrl: z.string().url('Avatar must be a valid URL').optional()
  })
  .refine((value) => value.fullName !== undefined || value.avatarUrl !== undefined, {
    message: 'Provide at least one profile field to update'
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
