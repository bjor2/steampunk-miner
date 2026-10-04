/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: Electron loads dist/index.html from file://, where "/assets/..." would
  // point at the filesystem root. The browser build is unaffected.
  base: './',
  server: {
    port: 5173,
    // electron:dev waits on this exact port.
    strictPort: true,
    watch: { ignored: ['**/.claude/**', '**/logs/**', '**/dist-electron/**'] },
  },
  test: {
    // vitest owns the fast headless tests (node, no DOM, no canvas, no physics world).
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', 'dist-electron/**', '.claude/**'],
  },
})
