/**
 * Контракт событий между игрой и приложением.
 * Меняется ТОЛЬКО согласованно с командами iOS / Android — это публичный контракт.
 * Держите его минимальным: игра ничего не начисляет сама, только сообщает факты.
 */

/** Версия протокола моста. Повышать при breaking-change в событиях. */
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

/** Слаги игр каталога — единый список для событий, конфигов и сервера. */
export const GAME_IDS = [
  'soz', 'pairs', 'fifteen', '2048', 'sudoku-kids',
  'stack', 'flyer', 'targets', 'snake', 'sorting', 'counting',
] as const;

export type GameId = (typeof GAME_IDS)[number];

/**
 * Режим партии: уровень лестницы, слово дня (только soz) или бесконечный
 * забег аркады. Сервер по режиму выбирает правила начисления.
 */
export type GameMode = 'level' | 'daily' | 'endless';

/**
 * Сырое игровое событие — основа событийного скоринга. Игра сообщает факты
 * («слита плитка», «найдена пара»), а сервер по конфигу игры превращает их
 * в баллы. Никаких сумм в событии нет — считать их клиенту запрещено.
 */
export interface RoundEvent {
  game: GameId;
  /** Имя события из конфига игры: 'pair_found', 'tile_merged'… */
  name: string;
  sessionId: string;
  /** Date.now() на клиенте — сервер сверяет с собственными часами. */
  clientTs: number;
  meta?: Record<string, number | string | boolean>;
}

/**
 * Финальный результат партии. Расширяет старый GAME_OVER метриками для звёзд
 * и достижений; сам счёт остаётся «сырым» — валидация и пересчёт на сервере.
 */
export interface GameResult {
  game: GameId;
  mode: GameMode;
  /** Номер уровня лестницы (для mode='level'). */
  level?: number;
  score: number;
  durationMs: number;
  sessionId: string;
  won?: boolean;
  /** Метрики партии: guessesUsed, moves, mistakes, timeSec… — по конфигу игры. */
  metrics?: Record<string, number>;
}

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
  /** Пакет сырых игровых событий для событийного скоринга (батчится мостом). */
  | { type: 'GAME_EVENTS'; events: RoundEvent[] }
  /** Структурированный итог партии. GAME_OVER остаётся для совместимости. */
  | { type: 'GAME_RESULT'; result: GameResult }
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
  | { type: 'REWARD_RESULT'; rewardId: string; granted: boolean; points?: number }
  /**
   * Ответ сервера на GAME_RESULT: начисленные баллы, звёзды, новый баланс
   * и разблокированные достижения. Игра только показывает эти числа.
   */
  | {
      type: 'PROGRESS_RESULT';
      sessionId: string;
      xp: number;
      stars?: number;
      balance?: number;
      achievements?: string[];
    };

/** Брендовая тема, которую приложение передаёт игре при INIT. */
export interface BrandTheme {
  primary: string;
  secondary: string;
  background: string;
  fontFamily?: string;
  logoUrl?: string;
}

export type BridgeEventType = GameToAppEvent['type'] | AppToGameEvent['type'];
