import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Fallback to MONGODB_URL if MONGO_URI is not set
process.env.MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URL;


const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
  MONGO_URI: z.string().url('MONGO_URI must be a valid connection string'),
  
  // Optional AI API Keys
  OPENAI_API_KEY: z.string().optional(),
  CLAUDE_API_KEY: z.string().optional(),
  
  // OpenRouter AI configuration (primary and fallback)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY_MODEL: z.string().optional(),
  OPENROUTER_API_KEY_2: z.string().optional(),
  OPENROUTER_API_KEY_2_MODEL: z.string().optional(),
  
  // Optional Token Encryption Key
  ENCRYPTION_KEY: z.string().optional(),

  // Frontend URL for OAuth redirects
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Social App Credentials (placeholders)
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TIKTOK_CLIENT_ID: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),

  // Zenuxs OAuth (real provider integration)
  ZENUXS_CLIENT_ID: z.string().optional(),
  ZENUXS_CLIENT_SECRET: z.string().optional(),
  ZENUXS_AUTH_SERVER: z.string().default('https://api.auth.zenuxs.in'),
  ZENUXS_GOOGLE_CLIENT_ID: z.string().optional(),
  ZENUXS_GOOGLE_CLIENT_SECRET: z.string().optional(),
  ZENUXS_GITHUB_CLIENT_ID: z.string().optional(),
  ZENUXS_GITHUB_CLIENT_SECRET: z.string().optional(),

  // Generic email configuration used by OTP delivery
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),

  // OTP Configuration
  OTP_EXPIRY_MINUTES: z.string().default('10').transform(Number),
  OTP_EMAIL_HOST: z.string().optional(),
  OTP_EMAIL_PORT: z.string().default('587').transform(Number),
  OTP_EMAIL_USER: z.string().optional(),
  OTP_EMAIL_PASS: z.string().optional(),
  
  // Redis configuration for BullMQ Post Scheduler
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
export type EnvType = z.infer<typeof envSchema>;
export default env;
