/**
 * Контракт событий между игрой и приложением.
 * Меняется ТОЛЬКО согласованно с командами iOS / Android — это публичный контракт.
 * Держите его минимальным: игра ничего не начисляет сама, только сообщает факты.
 */

/** Версия протокола моста. Повышать при breaking-change в событиях. */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

/** События, которые ИГРА отправляет ПРИЛОЖЕНИЮ. */
export type GameToAppEvent =
  /** Игра загрузилась и готова принимать init. */
  | { type: 'GAME_READY'; protocol: number }
  /** Игрок начал сессию (нажал Play). Нужен для серверных лимитов времени. */
  | { type: 'GAME_START'; sessionId: string }
  /** Игра завершена. score — «сырой» результат, валидируется на сервере. */
  | { type: 'GAME_OVER'; score: number; sessionId: string; durationMs: number }
  /** Игрок хочет забрать награду (сервер решает, положена ли она). */
  | { type: 'REWARD_CLAIM'; rewardId: string; sessionId: string }
  /** Прогресс/аналитика (необязательно). */
  | { type: 'GAME_EVENT'; name: string; payload?: Record<string, unknown> }
  /** Игрок хочет выйти из игры в каталог игр. Приложение возвращает WebView к списку игр. */
  | { type: 'GAME_EXIT'; sessionId: string }
  /** Ошибка внутри игры — чтобы приложение могло показать фолбэк. */
  | { type: 'GAME_ERROR'; message: string };

/** События, которые ПРИЛОЖЕНИЕ отправляет ИГРЕ (через appBridge.receive). */
export type AppToGameEvent =
  /** Инициализация: токен, локаль, тема бренда, id сессии. */
  | {
      type: 'INIT';
      authToken: string;
      apiBaseUrl: string;
      locale: 'ru' | 'uz' | 'en';
      sessionId: string;
      theme?: BrandTheme;
    }
  /** Приложение просит игру приостановиться (свернули WebView). */
  | { type: 'PAUSE' }
  /** Возобновить. */
  | { type: 'RESUME' }
  /** Результат подтверждения награды сервером. */
  | { type: 'REWARD_RESULT'; rewardId: string; granted: boolean; points?: number };

/** Брендовая тема, которую приложение передаёт игре при INIT. */
export interface BrandTheme {
  primary: string;
  secondary: string;
  background: string;
  fontFamily?: string;
  logoUrl?: string;
}

export type BridgeEventType = GameToAppEvent['type'] | AppToGameEvent['type'];
