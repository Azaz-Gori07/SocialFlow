"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
// Fallback to MONGODB_URL if MONGO_URI is not set
process.env.MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URL;
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('5000').transform(Number),
    JWT_SECRET: zod_1.z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
    MONGO_URI: zod_1.z.string().url('MONGO_URI must be a valid connection string'),
    // Optional AI API Keys
    OPENAI_API_KEY: zod_1.z.string().optional(),
    CLAUDE_API_KEY: zod_1.z.string().optional(),
    // OpenRouter AI configuration (primary and fallback)
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    OPENROUTER_API_KEY_MODEL: zod_1.z.string().optional(),
    OPENROUTER_API_KEY_2: zod_1.z.string().optional(),
    OPENROUTER_API_KEY_2_MODEL: zod_1.z.string().optional(),
    // Optional Token Encryption Key
    ENCRYPTION_KEY: zod_1.z.string().optional(),
    // Frontend URL for OAuth redirects
    FRONTEND_URL: zod_1.z.string().default('http://localhost:5173'),
    // Social App Credentials (placeholders)
    X_CLIENT_ID: zod_1.z.string().optional(),
    X_CLIENT_SECRET: zod_1.z.string().optional(),
    LINKEDIN_CLIENT_ID: zod_1.z.string().optional(),
    LINKEDIN_CLIENT_SECRET: zod_1.z.string().optional(),
    FACEBOOK_CLIENT_ID: zod_1.z.string().optional(),
    FACEBOOK_CLIENT_SECRET: zod_1.z.string().optional(),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    TIKTOK_CLIENT_ID: zod_1.z.string().optional(),
    TIKTOK_CLIENT_SECRET: zod_1.z.string().optional(),
    // Zenuxs OAuth (real provider integration)
    ZENUXS_CLIENT_ID: zod_1.z.string().optional(),
    ZENUXS_CLIENT_SECRET: zod_1.z.string().optional(),
    ZENUXS_AUTH_SERVER: zod_1.z.string().default('https://api.auth.zenuxs.in'),
    ZENUXS_GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    ZENUXS_GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    ZENUXS_GITHUB_CLIENT_ID: zod_1.z.string().optional(),
    ZENUXS_GITHUB_CLIENT_SECRET: zod_1.z.string().optional(),
    // Generic email configuration used by OTP delivery
    EMAIL_USER: zod_1.z.string().optional(),
    EMAIL_PASS: zod_1.z.string().optional(),
    // OTP Configuration
    OTP_EXPIRY_MINUTES: zod_1.z.string().default('10').transform(Number),
    OTP_EMAIL_HOST: zod_1.z.string().optional(),
    OTP_EMAIL_PORT: zod_1.z.string().default('587').transform(Number),
    OTP_EMAIL_USER: zod_1.z.string().optional(),
    OTP_EMAIL_PASS: zod_1.z.string().optional(),
    // Redis configuration for BullMQ Post Scheduler
    REDIS_HOST: zod_1.z.string().default('localhost'),
    REDIS_PORT: zod_1.z.string().default('6379').transform(Number),
    REDIS_PASSWORD: zod_1.z.string().optional(),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('❌ Invalid environment configuration:', JSON.stringify(parsedEnv.error.format(), null, 2));
    process.exit(1);
}
exports.env = parsedEnv.data;
exports.default = exports.env;
