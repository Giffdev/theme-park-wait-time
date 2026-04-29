import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.integration.{test,spec}.{ts,tsx}',
      'tests/security-rules/**/*.{test,spec}.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
