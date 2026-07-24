/**
 * @gamewingo/game-bridge
 * Единый мост «игра ↔ приложение» для всего каталога.
 *
 * Быстрый старт внутри игры (Phaser Boot/Preloader):
 *
 *   import { createBridge, createApiClient } from '@gamewingo/game-bridge';
 *
 *   const bridge = createBridge();
 *   let api: ReturnType<typeof createApiClient> | null = null;
 *   let session = '';
 *
 *   bridge.onApp((e) => {
 *     if (e.type === 'INIT') {
 *       session = e.sessionId;
 *       api = createApiClient({ baseUrl: e.apiBaseUrl, authToken: e.authToken });
 *       // применить e.theme к сцене
 *     }
 *   });
 *   bridge.ready();
 *
 *   // в конце партии:
 *   bridge.gameOver(score, session, durationMs);
 *   const res = await api?.submitScore({ sessionId: session, gameId: 'match3', score, durationMs });
 */

export * from './events.js';
export * from './bridge.js';
export * from './api.js';
