// Runs before any test module is imported (setupFiles), so env.config.ts
// validates successfully. Real MONGO_URI is replaced by mongodb-memory-server
// in jest.setup.js (beforeAll).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-0123456789abcdef0123456789abcdef';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/socialflow_test';
process.env.OPENAI_API_KEY = '';
process.env.CLAUDE_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';

// Integration suites assert that a provider with no credentials returns 503
// instead of fabricating data. A developer's real .env would otherwise leak in
// through dotenv and flip those assertions, so the suite starts with none set.
// Tests that need credentials assign them onto `env` themselves.
for (const key of [
  'OPENROUTER_API_KEY',
  'OPENROUTER_API_KEY_MODEL',
  'OPENROUTER_API_KEY_2',
  'OPENROUTER_API_KEY_2_MODEL',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'FACEBOOK_CLIENT_ID',
  'FACEBOOK_CLIENT_SECRET',
  'INSTAGRAM_CLIENT_ID',
  'INSTAGRAM_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'TIKTOK_CLIENT_ID',
  'TIKTOK_CLIENT_SECRET',
]) {
  process.env[key] = '';
}
