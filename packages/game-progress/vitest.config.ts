import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Прогресс живёт в localStorage — тестам нужен браузерный аналог.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
