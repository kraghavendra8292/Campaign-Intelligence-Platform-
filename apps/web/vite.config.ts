/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The `@rk/*` workspace packages ship TypeScript source rather than build
 * output, so Vite compiles them as part of this app. That keeps the monorepo
 * free of a package build-ordering step.
 */
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    strictPort: true,
  },

  preview: {
    port: 4173,
    strictPort: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    // Fail the build rather than silently shipping an oversized bundle.
    chunkSizeWarningLimit: 600,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: true,

    /*
     * The suite runs in English.
     *
     * The public site defaults to Kannada, so the many tests that assert
     * English strings have to SAY they want English rather than ride on the
     * app's default - otherwise changing that default silently rewrites what
     * every one of them is checking.
     *
     * Set here rather than in a setup file because `config/env.ts` validates
     * the environment once at module load, long before any hook runs.
     */
    env: {
      VITE_DEFAULT_LOCALE: 'en',
    },
  },
});
