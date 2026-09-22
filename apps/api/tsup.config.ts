import { defineConfig } from 'tsup';

/**
 * Production bundle for the API.
 *
 * The shared `@rk/*` workspace packages are published as TypeScript source
 * rather than compiled artefacts, so they are inlined here (`noExternal`).
 * Everything in node_modules stays external and is resolved at runtime, which
 * keeps native and engine-backed dependencies such as @prisma/client intact.
 *
 * Type checking is a separate concern handled by `npm run typecheck` (tsc).
 */
export default defineConfig({
  entry: { server: 'src/server.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Inline the workspace packages; leave real dependencies external.
  noExternal: [/^@rk\//],
  splitting: false,
  dts: false,
});
