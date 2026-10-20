import { z } from 'zod';

export const platformEnum = z.enum(
  ['twitter', 'x', 'instagram', 'facebook', 'linkedin', 'youtube', 'google', 'threads'],
  {
    message: "Platform must be one of: 'twitter', 'x', 'instagram', 'facebook', 'linkedin', 'youtube', 'google', 'threads'",
  }
);

export const connectPlatformSchema = z.object({
  platform: platformEnum,
});

export const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'OAuth state is required'),
});

export const accountIdSchema = z.object({
  id: z.string().min(1, 'Social account ID is required'),
});

export const connectionIdSchema = z.object({
  id: z.string().min(1, 'Connection ID is required'),
});

export const selectAccountSchema = z.object({
  platform: platformEnum,
  providerAccountId: z.string().min(1, 'providerAccountId is required'),
});

export const updateAccountSchema = z.object({
  publishDefault: z.boolean(),
});

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const xSessionConnectSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('cookies'),
    authToken: z.string().min(20, 'auth_token looks invalid').max(500),
    ct0: z.string().min(20, 'ct0 looks invalid').max(500),
  }),
  z.object({
    mode: z.literal('password'),
    username: z.string().min(1, 'X username or email is required').max(200),
    password: z.string().min(1, 'X password is required').max(200),
    email: z.preprocess(blankToUndefined, z.string().max(200).optional()),
    totpSecret: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  }),
]);

export type XSessionConnectInput = z.infer<typeof xSessionConnectSchema>;

export type ConnectPlatformInput = z.infer<typeof connectPlatformSchema>;
export type CallbackInput = z.infer<typeof callbackSchema>;
export type AccountIdInput = z.infer<typeof accountIdSchema>;
export type SelectAccountInput = z.infer<typeof selectAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
