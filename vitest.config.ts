import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/desktop/src/renderer/src', import.meta.url)) }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false
  }
})
