import type { Row, GameStatus } from './gameState';
import type { Locale } from './locale';

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
