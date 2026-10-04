import type { Row, GameStatus } from './gameState';
import type { Locale } from './locale';
import { recordDaily, sanitizeStats, type DailyOutcome, type DailyStats } from './stats';

export interface DailyState { rows: Row[]; status: GameStatus; rewardClaimed: boolean; }

export function dailyKey(locale: Locale, dayId: number): string {
  return `soz:${locale}:${dayId}`;
}

export function saveDaily(locale: Locale, dayId: number, state: DailyState): void {
  try {
    localStorage.setItem(dailyKey(locale, dayId), JSON.stringify(state));
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}

export function loadDaily(locale: Locale, dayId: number): DailyState | null {
  try {
    const raw = localStorage.getItem(dailyKey(locale, dayId));
    return raw ? (JSON.parse(raw) as DailyState) : null;
  } catch {
    return null;
  }
}

const ONBOARDED_KEY = 'soz:onboarded';

/** Прошёл ли игрок обучение (показываем один раз, при первой партии). */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}

const HIGH_CONTRAST_KEY = 'soz:highContrast';

/** Режим высокого контраста (для дальтоников). По умолчанию выключен. */
export function getHighContrast(): boolean {
  try {
    return localStorage.getItem(HIGH_CONTRAST_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHighContrast(on: boolean): void {
  try {
    localStorage.setItem(HIGH_CONTRAST_KEY, on ? '1' : '0');
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}

/**
 * Статистика слова дня — по языку, как и само слово дня (`dailyKey`): у RU и UZ
 * разные слова и разные дни «сыграно», серии не смешиваются.
 */
export function statsKey(locale: Locale): string {
  return `soz:stats:${locale}`;
}

export function loadStats(locale: Locale): DailyStats {
  try {
    const raw = localStorage.getItem(statsKey(locale));
    return sanitizeStats(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeStats(null);
  }
}

/** Записать итог слова дня (один раз на день — см. `recordDaily`) и вернуть статистику. */
export function recordDailyStats(locale: Locale, outcome: DailyOutcome): DailyStats {
  const before = loadStats(locale);
  const after = recordDaily(before, outcome);
  if (after !== before) {
    try {
      localStorage.setItem(statsKey(locale), JSON.stringify(after));
    } catch {
      /* quota / приватный режим — статистика покажется, но не сохранится */
    }
  }
  return after;
}
