import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Don't try to bundle Electron — tests mock it
    server: {
      deps: {
        external: ['electron']
      }
    }
  }
})
