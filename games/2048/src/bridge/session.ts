import type {
  GameBridge, ApiClient, AppToGameEvent, BrandTheme, LeaderboardEntry,
} from '@gamewingo/game-bridge';
import type { Locale } from '../core/locale';

export interface FinishInput {
  /** Готовый счёт из ядра (сумма слитых номиналов) — здесь НЕ пересчитывается. */
  score: number;
  maxTile: number;
  moves: number;
  durationMs: number;
}

export interface Session {
  locale: Locale; theme?: BrandTheme; sessionId: string; ready(): void;
  applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>): void;
  start(): void;
  /** Выйти из игры в каталог игр (приложение вернёт WebView к списку). */
  exit(): void;
  /** Конец партии: GAME_OVER хосту + отправка результата на сервер (начисление — там). */
  finish(input: FinishInput): Promise<{ accepted: boolean; pointsAwarded?: number } | null>;
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
    exit() { bridge.exit(sessionId); },
    async finish(input) {
      const { score, maxTile, moves, durationMs } = input;
      bridge.gameOver(score, sessionId, durationMs);
      bridge.track('round_finished', { maxTile, moves });
      if (!api) return null;
      try {
        return await api.submitScore({
          sessionId, gameId: '2048', score, durationMs,
          meta: { maxTile, moves },
        });
      } catch (err) {
        bridge.error(String(err));
        return null;
      }
    },
    async leaderboard(limit = 10) {
      if (!api) return [];
      try {
        return await api.leaderboard('2048', limit);
      } catch (err) {
        bridge.error(String(err));
        return [];
      }
    },
    onApp(cb) { return bridge.onApp(cb); },
  };
}
