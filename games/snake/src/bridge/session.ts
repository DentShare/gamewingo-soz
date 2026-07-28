import type {
  GameBridge, ApiClient, AppToGameEvent, BrandTheme, LeaderboardEntry,
} from '@gamewingo/game-bridge';
import { clampScore } from '../core/score';
import { START_LENGTH } from '../core/snake';
import type { Locale } from '../core/locale';

export interface FinishInput {
  /** Счёт партии из ядра (сервер валидирует его повторно). */
  score: number;
  /** Сколько раз змейка съела еду. */
  eaten: number;
  durationMs: number;
  /** Итоговая длина змейки; если не передана — выводится из `eaten`. */
  length?: number;
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
      const score = clampScore(input.score);
      const length = input.length ?? START_LENGTH + input.eaten;
      bridge.gameOver(score, sessionId, input.durationMs);
      bridge.track('round_finished', { eaten: input.eaten, length });
      if (!api) return null;
      try {
        return await api.submitScore({
          sessionId, gameId: 'snake', score, durationMs: input.durationMs,
          meta: { eaten: input.eaten, length },
        });
      } catch (err) {
        bridge.error(String(err));
        return null;
      }
    },
    exit() { bridge.exit(sessionId); },
    async leaderboard(limit = 10) {
      if (!api) return [];
      try {
        return await api.leaderboard('snake', limit);
      } catch (err) {
        bridge.error(String(err));
        return [];
      }
    },
    onApp(cb) { return bridge.onApp(cb); },
  };
}
