import type {
  GameBridge, ApiClient, AppToGameEvent, BrandTheme, LeaderboardEntry,
} from '@gamewingo/game-bridge';
import { computeScore } from '../core/score';
import type { Locale } from '../core/locale';
import type { Row } from '../core/gameState';

export interface FinishInput {
  mode: 'daily' | 'practice'; dayId: number; locale?: Locale;
  guessesUsed: number; solved: boolean; durationMs: number; rows: Row[];
}
export type RewardResult = { rewardId: string; granted: boolean; points?: number };

export interface Session {
  locale: Locale; theme?: BrandTheme; sessionId: string; ready(): void;
  applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>): void;
  start(): void;
  finish(input: FinishInput): Promise<{ accepted: boolean; pointsAwarded?: number } | null>;
  claim(rewardId: string): void;
  /** Шэринг результата: событие хосту (нативный share) + фолбэк в буфер. */
  shareResult(text: string): void;
  /** Лидерборд по слову дня (per-locale фильтр — на сервере). Пустой массив при ошибке/деве. */
  leaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Подписка на REWARD_RESULT от приложения. Возвращает функцию отписки. */
  onReward(cb: (r: RewardResult) => void): () => void;
  /** Проброс PAUSE/RESUME (и др.) наверх — для игрового таймера. Возвращает отписку. */
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
      const score = computeScore(input);
      bridge.gameOver(score, sessionId, input.durationMs);
      bridge.track('round_finished', { mode: input.mode, solved: input.solved });
      if (input.mode !== 'daily' || !api) return null;
      try {
        return await api.submitScore({
          sessionId, gameId: 'soz', score, durationMs: input.durationMs,
          meta: {
            dayId: input.dayId, guessesUsed: input.guessesUsed,
            solved: input.solved, rows: input.rows, locale,
          },
        });
      } catch (err) {
        bridge.error(String(err));
        return null;
      }
    },
    claim(rewardId) { bridge.claimReward(rewardId, sessionId); },
    shareResult(text) {
      bridge.track('share_result', { text });
      try {
        navigator.clipboard?.writeText(text);
      } catch {
        /* буфер недоступен в WebView — основной путь через событие хосту */
      }
    },
    async leaderboard(limit = 10) {
      if (!api) return [];
      try {
        return await api.leaderboard('soz', limit);
      } catch (err) {
        bridge.error(String(err));
        return [];
      }
    },
    onReward(cb) {
      return bridge.onApp((e) => {
        if (e.type === 'REWARD_RESULT') cb({ rewardId: e.rewardId, granted: e.granted, points: e.points });
      });
    },
    onApp(cb) { return bridge.onApp(cb); },
  };
}
