// Renders public/icon-source.svg into all PNG sizes needed for the PWA + favicon.
// Run with: node scripts/generate-icons.mjs
//
// Outputs (all in public/):
//   icon-192.png         Android maskable + monochrome
//   icon-512.png         Android splash, also referenced as "any" in manifest
//   apple-touch-icon.png 180x180 — iOS Add to Home Screen
//   icon-maskable-512.png 512x512 with safe-zone padding (Android adaptive icons)
//
// The maskable variant adds padding because Android crops adaptive icons into
// circles, squircles, etc. The W3C maskable spec asks for the meaningful art
// to live in the inner 80% (a "safe zone").

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

const srcSvg = readFileSync(join(publicDir, 'icon-source.svg'));

async function renderPng(size, outName) {
  const out = join(publicDir, outName);
  await sharp(srcSvg)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${outName} (${size}×${size})`);
}

async function renderMaskable(size, outName) {
  // Maskable icons need a safe zone — render the design at 80%, padded with the
  // background color so the OS can crop it to any shape without clipping the art.
  const innerSize = Math.round(size * 0.8);
  const pad = Math.round((size - innerSize) / 2);
  const inner = await sharp(srcSvg).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0x2d, g: 0x7a, b: 0x3d, alpha: 1 }, // shed-green
    },
  })
    .composite([{ input: inner, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, outName));
  console.log(`✓ ${outName} (${size}×${size}, maskable safe-zone)`);
}

mkdirSync(publicDir, { recursive: true });

await renderPng(192, 'icon-192.png');
await renderPng(512, 'icon-512.png');
await renderPng(180, 'apple-touch-icon.png');
await renderMaskable(512, 'icon-maskable-512.png');

console.log('\nDone.');
