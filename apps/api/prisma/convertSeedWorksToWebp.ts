/**
 * One-shot: convert seed JPEG/PNG work photos to WebP for smaller LCP payloads.
 * Run: npx tsx prisma/convertSeedWorksToWebp.ts  (from apps/api)
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'seed-assets', 'works');

const files = await readdir(dir);
for (const file of files) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const input = join(dir, file);
  const outName = file.replace(/\.(png|jpe?g)$/i, '.webp');
  const out = join(dir, outName);
  const buf = await sharp(await readFile(input))
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
  await writeFile(out, buf);
  console.log(`${file} -> ${outName} (${Math.round(buf.byteLength / 1024)} KB)`);
}
