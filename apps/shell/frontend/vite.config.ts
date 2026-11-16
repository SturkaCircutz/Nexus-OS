/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@nexus/window-state': fileURLToPath(
        new URL('../../../modules/window-state/types.ts', import.meta.url),
      ),
      '@nexus/ipc': fileURLToPath(
        new URL('../../../modules/ipc/contract.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/ui/testing/setup.ts'],
    css: true,
  },
})
