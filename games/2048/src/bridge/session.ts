import { reportResult } from '@gamewingo/game-bridge';
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
  /** Собрана плитка 2048 — для задания дня «выиграй N партий». */
  won: boolean;
  /** Скоростные испытания (1/0): номинал собран не позднее заданного хода. */
  tile256in220: number;
  tile512in400: number;
  tile1024in800: number;
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
      return reportResult(bridge, api, {
        game: '2048', mode: 'endless', won: input.won, score, durationMs, sessionId,
        metrics: {
          maxTile, moves, tile256in220: input.tile256in220,
          tile512in400: input.tile512in400, tile1024in800: input.tile1024in800,
        },
      });
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
