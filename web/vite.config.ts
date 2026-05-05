/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// SPA is served from a project sub-path on GitHub Pages
// (subhayu99.github.io/vellaris/). Both Vite's emitted asset URLs and the
// router's basename need to match. The deploy workflow exports
// VITE_BASE_PATH; dev / tests fall back to "/".
const basePath = process.env.VITE_BASE_PATH || '/'

// Read the canonical version from the repo's pyproject.toml at build time
// so the docs / footer / nav badges don't drift (used to be hardcoded as
// "v0.4.1" in eight places). Falls back to 0.0.0 if the file is missing
// (e.g. running the SPA outside the monorepo).
const APP_VERSION = (() => {
  try {
    const text = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'pyproject.toml'), 'utf8')
    const match = text.match(/^version\s*=\s*"([^"]+)"/m)
    return match?.[1] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // U2: surface "New version available" banner instead of silently
      // swapping the SW under the user's feet. The SPA registers via
      // `workbox-window` and prompts the user when a new SW is waiting.
      registerType: 'prompt',
      // We register the SW ourselves from the SPA so we can wire the
      // update banner — disable the auto-injected registration script.
      injectRegister: null,
      // We hand-write the SW (in `src/sw/push-handler.ts`) because later
      // phases add custom push / notificationclick handlers that
      // generateSW can't express. injectManifest just splices the
      // precache file list into our source.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'push-handler.ts',
      injectManifest: {
        // The default 2 MB ceiling rejects our marketing PNGs and the
        // larger built JS chunks; bump to 4 MB so precache covers the
        // whole shell.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Vellaris',
        short_name: 'Vellaris',
        description: 'End-to-end encrypted document sharing.',
        theme_color: '#0a0817',
        background_color: '#0a0817',
        display: 'standalone',
        start_url: basePath,
        scope: basePath,
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The dev server doesn't need a SW (HMR lives there) and turning
      // it on would mask code changes behind the precache. Leave SW
      // generation strictly to `pnpm build`.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  },
})
