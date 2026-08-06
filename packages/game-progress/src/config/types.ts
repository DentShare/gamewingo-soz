import type { GameId } from '@gamewingo/game-bridge';
import type { StarGoals } from '../ladder.js';

/**
 * Контракт конфигов прогрессии — единый источник правил начисления для сервера.
 *
 * Конфиги описывают, во что сервер превращает сырые события игры: баллы, звёзды,
 * задания и достижения. Клиент эти правила не исполняет (железное правило №1 —
 * игра не начисляет баллы), он их только определяет и выгружает на бэкенд
 * скриптом `progression:export`. Админка может переопределить конфиг в Supabase
 * без релиза — поэтому всё здесь сериализуемо в JSON: никаких функций.
 */

export type StarOp = 'gte' | 'lte';

export interface LocalizedText {
  ru: string;
  uz: string;
}

/**
 * Модификатор балльного правила.
 * linear: множитель = 1 + factor × meta[source], сверху ограничен cap.
 * threshold: если meta[source] ≥ threshold, множитель = multiplier.
 */
export interface Modifier {
  source: string;
  type: 'linear' | 'threshold';
  factor?: number;
  threshold?: number;
  multiplier?: number;
  cap?: number;
}

/** Сколько баллов даёт одно событие игры. */
export interface ScoreRule {
  /** Имя события из моста: 'pair_found', 'tile_merged'… */
  event: string;
  base: number;
  /** Если событие про N единиц (плитка номинала, метры пути) — база умножается на meta[perItemKey]. */
  perItemKey?: string;
  modifiers?: Modifier[];
  /** Потолок баллов за одно событие. */
  cap?: number;
}

/**
 * Запасное правило звёзд по метрике результата — для партий вне лестницы
 * (слово дня, бесконечный режим). Уровни лестницы судятся по своим goals.
 */
export interface StarRule {
  stars: 1 | 2 | 3;
  metric: string;
  op: StarOp;
  value: number;
}

/** Задание дня конкретной игры (серверный слой поверх заданий каталога). */
export interface QuestDef {
  id: string;
  title: LocalizedText;
  /** Что считаем за день: 'pairsFound', 'maxTile'… */
  metric: string;
  target: number;
  reward: number;
}

/**
 * Достижение конкретной игры. Имя типа отличается от каталожного
 * `AchievementDef` (achievements.ts) — это разные слои.
 */
export interface GameAchievementDef {
  id: string;
  title: LocalizedText;
  /** Кумулятивная метрика в user_stats на сервере. */
  metric: string;
  op: StarOp;
  value: number;
  reward: number;
}

/** Серверные лимиты антифрода на игру. */
export interface AntiFraudLimits {
  maxScorePerSession: number;
  maxSessionMs: number;
  maxEventsPerMinute: number;
}

/**
 * Уровень лестницы в выгрузке: срез реального `LevelDef<P>` игры.
 * Заполняется скриптом экспорта из games/<slug>/src/core/levels.ts —
 * в центральном конфиге уровней нет, чтобы не плодить второй источник истины.
 */
export interface ExportedLevel {
  n: number;
  params: Record<string, unknown>;
  goals: StarGoals;
}

export interface ProgressionConfig {
  gameId: GameId;
  version: number;
  scoring: ScoreRule[];
  /**
   * Метрика результата, которой судятся звёзды уровня: значение сравнивается
   * с goals уровня из лестницы игры ('guessesUsed', 'moves', 'mistakes',
   * 'timeSec', 'score').
   */
  starMetric: string;
  /** Запасные пороги для партий вне лестницы. */
  starsFallback: StarRule[];
  /** Реальная лестница игры; появляется в JSON после progression:export. */
  levels?: ExportedLevel[];
  dailyQuests: QuestDef[];
  achievements: GameAchievementDef[];
  antiFraud: AntiFraudLimits;
}
