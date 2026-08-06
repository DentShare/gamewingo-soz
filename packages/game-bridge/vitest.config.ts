import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Мост говорит через window.postMessage — тестам нужен браузерный аналог.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
