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
