/**
 * Generates `src/tokens.generated.css` from `src/tokens.ts`.
 *
 * Two modes:
 *   build  - write the file (default)
 *   check  - fail if the committed file is stale (used by CI)
 *
 * The generated CSS is committed so a fresh clone can build the web app
 * without a code-generation step, while `check` guarantees it never drifts
 * from the TypeScript source of truth.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, '../src/tokens.generated.css');

const { renderTokensCss } = await import('../src/css.ts');
const expected = renderTokensCss();

const mode = process.argv[2] === 'check' ? 'check' : 'build';

if (mode === 'check') {
  let actual = null;
  try {
    actual = await readFile(outputPath, 'utf8');
  } catch {
    console.error('design-tokens: tokens.generated.css is missing. Run `npm run tokens:build`.');
    process.exit(1);
  }

  if (actual !== expected) {
    console.error(
      'design-tokens: tokens.generated.css is out of date with tokens.ts.\n' +
        'Run `npm run tokens:build` and commit the result.',
    );
    process.exit(1);
  }

  console.log('design-tokens: tokens.generated.css is up to date.');
} else {
  await writeFile(outputPath, expected, 'utf8');
  console.log(`design-tokens: wrote ${outputPath}`);
}
