import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

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
    // Node 25's native storage shadows jsdom storage without a backing file.
    execArgv: Number(process.versions.node.split('.')[0]) >= 25 ? ['--no-experimental-webstorage'] : [],
    setupFiles: ['src/ui/testing/setup.ts'],
    css: true,
    clearMocks: true,
  },
})
