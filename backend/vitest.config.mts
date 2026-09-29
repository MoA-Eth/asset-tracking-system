import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: {
      strict: false,
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
  },
});
