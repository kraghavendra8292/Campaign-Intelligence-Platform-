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
export default defineConfig(({ mode }) => ({
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
    // Source maps stay local for debugging; do not ship large .map files to
    // citizens on mobile data.
    sourcemap: mode === 'development' ? true : 'hidden',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react-router')) {
            return 'router';
          }
          if (id.includes('/packages/ui/') || id.includes('\\packages\\ui\\')) {
            return 'ui';
          }
          return undefined;
        },
      },
    },
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
}));
