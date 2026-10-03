import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Alias for compatibility: MONGO_URI wins, MONGODB_URL is accepted.
process.env.MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URL || '';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.string().default('5000').transform(Number),
  BACKEND_URL: z.string().url('BACKEND_URL must be a valid URL').default('http://localhost:5000'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  MONGO_URI: z.string().url('MONGO_URI must be a valid connection string'),

  // Token encryption key. Required in production; derived from JWT_SECRET in dev.
  ENCRYPTION_KEY: z.string().optional(),

  // AI service keys
  OPENAI_API_KEY: z.string().optional(),
  CLAUDE_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY_MODEL: z.string().optional(),
  OPENROUTER_API_KEY_2: z.string().optional(),
  OPENROUTER_API_KEY_2_MODEL: z.string().optional(),

  // Auth OAuth (Zenuxs: login via Google/GitHub)
  ZENUXS_CLIENT_ID: z.string().optional(),
  ZENUXS_CLIENT_SECRET: z.string().optional(),
  ZENUXS_AUTH_SERVER: z.string().default('https://api.auth.zenuxs.in'),
  ZENUXS_GOOGLE_CLIENT_ID: z.string().optional(),
  ZENUXS_GOOGLE_CLIENT_SECRET: z.string().optional(),
  ZENUXS_GITHUB_CLIENT_ID: z.string().optional(),
  ZENUXS_GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email / OTP
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  OTP_EXPIRY_MINUTES: z.string().default('10').transform(Number),
  OTP_EMAIL_HOST: z.string().optional(),
  OTP_EMAIL_PORT: z.string().default('587').transform(Number),
  OTP_EMAIL_USER: z.string().optional(),
  OTP_EMAIL_PASS: z.string().optional(),

  // Social providers
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  // Facebook Login for Business configuration ID. Sent as `config_id` on the
  // Meta authorization URL only. When absent the provider omits it and the
  // standard Facebook Login flow proceeds unchanged.
  FACEBOOK_LOGIN_CONFIG_ID: z.string().optional(),
  INSTAGRAM_CLIENT_ID: z.string().optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  // Threads API credentials. Threads is a SEPARATE Meta app with its own ID and
  // secret (developers.facebook.com/docs/threads — get-started/create-an-app), so
  // it does not share FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET.
  Threads_CLIENT_ID: z.string().optional(),
  Threads_CLIENT_SECRET: z.string().optional(),

  // Developer Intelligence (feature-gated). All optional: when the feature is
  // off — the default — the routes 404 and no GitHub credentials are needed.
  DEVELOPER_FLOW_ENABLED: z.string().optional().default('false'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:');
  console.error(JSON.stringify(parsedEnv.error.flatten(), null, 2));
  process.exit(1);
}

const raw = parsedEnv.data;

const isProduction = raw.NODE_ENV === 'production';

// Token encryption key policy:
// - production: ENCRYPTION_KEY is mandatory and must be >= 32 chars
// - development/test: derived deterministically from JWT_SECRET (keeps existing dev data decryptable)
let encryptionKey: string;
if (raw.ENCRYPTION_KEY) {
  if (raw.ENCRYPTION_KEY.length < 32 && isProduction) {
    console.error('Invalid environment configuration: ENCRYPTION_KEY must be at least 32 characters in production');
    process.exit(1);
  }
  encryptionKey = raw.ENCRYPTION_KEY;
} else if (isProduction) {
  console.error('Invalid environment configuration: ENCRYPTION_KEY is required in production');
  process.exit(1);
} else {
  encryptionKey = crypto.createHash('sha256').update(raw.JWT_SECRET).digest('hex');
  console.warn('[env] ENCRYPTION_KEY not set; deriving a key from JWT_SECRET (development only).');
}

// CORS allowlist: explicit origins only. Defaults to FRONTEND_URL.
const corsOrigins = raw.CORS_ORIGINS
  ? raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [raw.FRONTEND_URL];

// Meta handles both Facebook and Instagram through the same app.
const facebookClientId = raw.FACEBOOK_CLIENT_ID || raw.INSTAGRAM_CLIENT_ID || '';
const facebookClientSecret = raw.FACEBOOK_CLIENT_SECRET || raw.INSTAGRAM_CLIENT_SECRET || '';

export const env = {
  ...raw,
  isProduction,
  isDevelopment: !isProduction,
  // Feature flag for the Developer Intelligence module. Off unless explicitly
  // set to the exact string 'true' — any other value keeps every route 404.
  developerFlowEnabled: raw.DEVELOPER_FLOW_ENABLED === 'true',
  encryptionKey,
  corsOrigins,
  meta: {
    clientId: facebookClientId,
    clientSecret: facebookClientSecret,
    // Facebook Login for Business. Empty string means "not configured" — the
    // provider then builds the authorization URL without `config_id`.
    loginConfigId: raw.FACEBOOK_LOGIN_CONFIG_ID || '',
    webhookVerifyToken: raw.META_WEBHOOK_VERIFY_TOKEN || '',
    webhookSecret: raw.META_WEBHOOK_SECRET || '',
  },
};

export type EnvType = typeof env;
export default env;
