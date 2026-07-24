import type { UnitStatus } from '../core/evaluate';

/** Бандл-шрифт с покрытием кириллица + латиница + ʻ (U+02BB). Фолбэк — системный sans-serif. */
export const FONT = 'Rubik, sans-serif';

export interface Palette {
  correct: number;
  present: number;
  absent: number;
}

/** Обычная палитра (Wordle-цвета). */
export const NORMAL: Palette = { correct: 0x538d4e, present: 0xb59f3b, absent: 0x3a3c42 };
/** High-contrast для дальтоников: оранжевый / голубой (по мотивам colourblind-режима Wordle). */
export const HIGH_CONTRAST: Palette = { correct: 0xf5793a, present: 0x85c0f9, absent: 0x3a3c42 };

export const COLORS = {
  bg: 0x111317,
  emptyBorder: 0x3a3d44,
  filledBorder: 0x6b6f78,
  keyDefault: 0x818384,
  keyText: '#111317',
  tileText: '#ffffff',
  headText: '#e9e9ea',
  panel: 0x2a2d34,
};

export function paletteFor(highContrast: boolean): Palette {
  return highContrast ? HIGH_CONTRAST : NORMAL;
}

export function statusColor(status: UnitStatus, p: Palette): number {
  return p[status];
}
