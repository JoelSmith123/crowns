import { defineConfig } from 'vitest/config';

// Relative base so the static build works at any path on Cloudflare Pages.
export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
