import type { Config } from 'jest';

const config: Config = {
  preset: '/home/azaz/Projects/SocialFlow/server/node_modules/ts-jest/presets/default/jest-preset.js',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts', '**/*.test.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  setupFiles: ['<rootDir>/jest.env.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};

export default config;
