import type { UnitStatus } from '../core/evaluate';
import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';

/** Шрифт каталога — системный шрифт платформы (см. docs/DESIGN.md). */
export const FONT = UI_FONT;

export interface Palette {
  correct: number;
  present: number;
  absent: number;
}

/** Статусы плиток: зелёный (угадано) / оранжевый (не на месте) / серый (нет в слове). */
export const NORMAL: Palette = { correct: C.success, present: C.primary, absent: C.muted };
/** High-contrast для дальтоников: оранжевый / синий. */
export const HIGH_CONTRAST: Palette = { correct: 0xf5793a, present: 0x2b8ce6, absent: C.muted };

/** Цвета экрана — только общие токены, локальных хексов быть не должно. */
export const COLORS = {
  bg: C.bg,
  emptyBorder: C.divider,   // граница пустой плитки
  filledBorder: C.muted,    // граница набранной плитки
  keyDefault: C.surface,    // клавиша — белая карточка
  digraphKey: C.tint,       // диграф-клавиша: персиковый тинт
  keyText: S.ink,
  iconDark: C.ink,          // иконки Enter/Backspace
  tileTextDark: S.ink,      // текст на пустой/набранной плитке
  tileTextLight: S.white,   // текст на цветной плитке
  headText: S.ink,
  headMuted: S.muted,
  panel: C.surface,
  panelBorder: C.divider,
  panelHover: C.tint,
  primary: C.primary,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,
};

export function paletteFor(highContrast: boolean): Palette {
  return highContrast ? HIGH_CONTRAST : NORMAL;
}

export function statusColor(status: UnitStatus, p: Palette): number {
  return p[status];
}
