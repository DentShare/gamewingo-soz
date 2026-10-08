import { reportResult } from '@gamewingo/game-bridge';
import type {
  GameBridge, ApiClient, AppToGameEvent, BrandTheme, LeaderboardEntry,
} from '@gamewingo/game-bridge';
import type { Locale } from '../core/locale';

export interface FinishInput {
  /** Готовый счёт из ядра (`computeScore`) — сервер валидирует его сам. */
  score: number;
  /** Установленных блоков за партию. */
  blocks: number;
  /** Идеальных попаданий. */
  perfects: number;
  /** Самая длинная серия идеальных попаданий подряд. */
  perfectStreak: number;
  durationMs: number;
}

export interface Session {
  locale: Locale; theme?: BrandTheme; sessionId: string; ready(): void;
  applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>): void;
  start(): void;
  /** Конец партии: GAME_OVER хосту + отправка результата на сервер (начисление — там). */
  finish(input: FinishInput): Promise<{ accepted: boolean; pointsAwarded?: number } | null>;
  /** Выйти из игры в каталог игр (приложение вернёт WebView к списку). */
  exit(): void;
  leaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Проброс PAUSE/RESUME наверх — для игрового таймера. Возвращает отписку. */
  onApp(cb: (e: AppToGameEvent) => void): () => void;
}

export function createSession(
  bridge: GameBridge,
  makeApi: (base: string, token: string) => ApiClient,
): Session {
  let locale: Locale = 'ru';
  let theme: BrandTheme | undefined;
  let sessionId = 'local-dev';
  let api: ApiClient | null = null;

  return {
    get locale() { return locale; },
    get theme() { return theme; },
    get sessionId() { return sessionId; },
    ready() { bridge.ready(); },
    applyInit(e) {
      locale = e.locale === 'uz' ? 'uz' : 'ru';
      theme = e.theme;
      sessionId = e.sessionId;
      api = makeApi(e.apiBaseUrl, e.authToken);
    },
    start() { bridge.start(sessionId); },
    async finish(input) {
      bridge.gameOver(input.score, sessionId, input.durationMs);
      bridge.track('round_finished', { blocks: input.blocks, perfects: input.perfects });
      // Высота башни — число поставленных блоков, как на экране итога.
      return reportResult(bridge, api, {
        game: 'stack', mode: 'endless', score: input.score, durationMs: input.durationMs, sessionId,
        metrics: {
          blocks: input.blocks, perfects: input.perfects, perfectStreak: input.perfectStreak,
          height: input.blocks, bestHeight: input.blocks,
        },
      });
    },
    exit() { bridge.exit(sessionId); },
    async leaderboard(limit = 10) {
      if (!api) return [];
      try {
        return await api.leaderboard('stack', limit);
      } catch (err) {
        bridge.error(String(err));
        return [];
      }
    },
    onApp(cb) { return bridge.onApp(cb); },
  };
}
