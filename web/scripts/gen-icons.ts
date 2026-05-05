/**
 * Rasterize the V-sigil to all the PNG sizes a PWA install + apple-touch-icon
 * + Android adaptive icons want. Outputs are committed to git so prod builds
 * stay hash-stable; only re-run when the sigil itself changes.
 *
 *   pnpm gen-icons
 *
 * Sizes produced (web/public/icons/):
 *   pwa-192x192.png            Android adaptive "any" purpose
 *   pwa-512x512.png            Android adaptive "any" purpose, splash source
 *   pwa-maskable-192x192.png   Android adaptive "maskable" — V in inner 80%
 *   pwa-maskable-512x512.png   ditto
 *   apple-touch-icon-180x180.png  iOS home-screen icon (iOS rounds corners)
 *   favicon-32.png             Legacy <link rel="icon"> bitmap fallback
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'icons')

// Rendered SVG of the V-sigil. Colors locked to the brand palette
// (midnight #0a0817 background, gold #cba65a strokes) — these match
// `web/src/components/v-sigil.tsx` and `web/public/favicon.svg`.
function buildSigilSvg({ size, padding }: { size: number; padding: number }): string {
  const inner = size - padding * 2
  // The V-sigil source viewBox is 40×40; embed it into the inner area
  // and let SVG scale handle the rest.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#cba65a" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#cba65a" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="#0a0817"/>
    <g transform="translate(${padding} ${padding}) scale(${inner / 40})">
      <path d="M6 32 V18 a14 14 0 0 1 28 0 V32"
            fill="none" stroke="#cba65a" stroke-opacity="0.32"
            stroke-width="1.2" stroke-linecap="round"/>
      <path d="M11 12 L20 30" stroke="url(#g)" stroke-width="2"
            stroke-linecap="round" fill="none"/>
      <path d="M29 12 L20 30" stroke="url(#g)" stroke-width="2"
            stroke-linecap="round" fill="none"/>
      <circle cx="20" cy="30" r="1.4" fill="#cba65a"/>
    </g>
  </svg>`
}

interface IconSpec {
  name: string
  size: number
  // Padding ratio (0.0–0.5). Maskable icons reserve 20% as safe-area for
  // adaptive-icon mask cropping; "any" purpose icons use a small bleed
  // for visual breathing room; the apple-touch-icon hugs the edge because
  // iOS handles rounding itself.
  paddingRatio: number
}

const SPECS: IconSpec[] = [
  { name: 'pwa-192x192.png', size: 192, paddingRatio: 0.06 },
  { name: 'pwa-512x512.png', size: 512, paddingRatio: 0.06 },
  { name: 'pwa-maskable-192x192.png', size: 192, paddingRatio: 0.18 },
  { name: 'pwa-maskable-512x512.png', size: 512, paddingRatio: 0.18 },
  { name: 'apple-touch-icon-180x180.png', size: 180, paddingRatio: 0.04 },
  { name: 'favicon-32.png', size: 32, paddingRatio: 0.0 },
]

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  for (const spec of SPECS) {
    const svg = buildSigilSvg({
      size: spec.size,
      padding: Math.round(spec.size * spec.paddingRatio),
    })
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
    const out = path.join(OUT_DIR, spec.name)
    await writeFile(out, png)
    console.log(`wrote ${path.relative(process.cwd(), out)} (${png.length} B)`)
  }
}

await main()
