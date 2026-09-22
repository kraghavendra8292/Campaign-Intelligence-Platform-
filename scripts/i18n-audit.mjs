#!/usr/bin/env node
/**
 * Finds hardcoded UI strings in the campaign console.
 *
 * The console is bilingual, and `translateAdmin` falls back to English per key
 * so an untranslated string is INVISIBLE in review - it only shows up as an
 * English word inside a Kannada page. This makes the remaining work countable:
 *
 *   node scripts/i18n-audit.mjs            list every file with a count
 *   node scripts/i18n-audit.mjs --verbose  list the strings themselves
 *   node scripts/i18n-audit.mjs --max 250  exit non-zero above a budget
 *
 * It is a HEURISTIC, not a parser. It looks for JSX text nodes and the props a
 * user actually reads. Expect a few false positives; it is meant to show the
 * trend and point at the next file worth doing, not to gate a build on its own.
 *
 * The dictionaries themselves are checked properly elsewhere: the test suite
 * asserts `adminTranslationGaps` and `translationGaps` are empty, so a key that
 * exists in English but not Kannada fails the build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = [
  'apps/web/src/pages/admin',
  'apps/web/src/components/cms',
  'apps/web/src/components/qr',
  'apps/web/src/components/analytics',
  'apps/web/src/components/ai',
  'apps/web/src/components/issues',
  'apps/web/src/components/communication',
  'apps/web/src/components/work',
];

/** A JSX text node holding words rather than markup. */
const JSX_TEXT = /> *([A-Z][A-Za-z0-9 ,.'’&%:/()-]{2,}?) *</g;

/** String-valued props that end up in front of a person. */
const PROP =
  /\b(label|title|placeholder|aria-label|heading|description|emptyMessage|hint|caption|confirmLabel|cancelLabel|submitLabel|retryLabel|subtitle|saveLabel)=["'{]+ *([A-Z][^"'}\n]{2,})/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const verbose = process.argv.includes('--verbose');
const maxIndex = process.argv.indexOf('--max');
const max = maxIndex === -1 ? null : Number(process.argv[maxIndex + 1]);

const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    // Comments hold prose that is not shipped to anyone.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const hits = [];
    for (const [, text] of source.matchAll(JSX_TEXT)) hits.push(text.trim());
    for (const [, , text] of source.matchAll(PROP)) hits.push(text.trim());

    if (hits.length) findings.push({ file: relative(process.cwd(), file), hits });
  }
}

findings.sort((a, b) => b.hits.length - a.hits.length);

const total = findings.reduce((sum, f) => sum + f.hits.length, 0);
const distinct = new Set(findings.flatMap((f) => f.hits)).size;

for (const { file, hits } of findings) {
  console.log(`${String(hits.length).padStart(4)}  ${file}`);
  if (verbose) for (const hit of [...new Set(hits)].sort()) console.log(`        ${hit}`);
}

console.log('');
console.log(`files with hardcoded strings : ${findings.length}`);
console.log(`occurrences                  : ${total}`);
console.log(`distinct strings             : ${distinct}`);

if (max !== null && total > max) {
  console.error(`\nOver budget: ${total} hardcoded strings, limit ${max}.`);
  process.exit(1);
}
