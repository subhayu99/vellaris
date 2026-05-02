/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
    const text = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'pyproject.toml'),
      'utf8',
    )
    const match = text.match(/^version\s*=\s*"([^"]+)"/m)
    return match?.[1] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
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
