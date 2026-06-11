import { z } from 'zod';

const platformEnum = z.enum(['twitter', 'x', 'linkedin', 'youtube', 'google'], {
  message: "Platform must be one of: 'twitter', 'x', 'linkedin', or 'youtube'"
});

export const connectPlatformSchema = z.object({
  platform: platformEnum
});

export const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'OAuth state is required')
});

export const accountIdSchema = z.object({
  id: z.string().min(1, 'Social account ID is required')
});

export type ConnectPlatformInput = z.infer<typeof connectPlatformSchema>;
export type CallbackInput = z.infer<typeof callbackSchema>;
export type AccountIdInput = z.infer<typeof accountIdSchema>;
