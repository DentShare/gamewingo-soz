import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';

/** Шрифт каталога — системный шрифт платформы (см. docs/DESIGN.md). */
export const FONT = UI_FONT;

/** Централизованная палитра (светлая тема WinGo — общая для каталога). */
export const COLORS = {
  bg: C.bg,
  headText: S.ink,
  headMuted: S.muted,
  panel: C.surface,
  panelBorder: C.divider,
  primary: C.primary,
  iconDark: C.ink,
  board: C.surface,           // подложка игрового поля
  boardCell: C.slot,          // пустой слот поля
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,
};

/**
 * Карта цветов плиток по номиналам: тёплая шкала от кремового (2)
 * к оранжевому WinGo (2048) и тёмно-коричневому (4096+).
 */
export const TILE_COLORS: Record<number, number> = {
  2: C.tint,
  4: 0xffd9c0,
  8: 0xffc39c,
  16: 0xffad78,
  32: C.primarySoft,
  64: 0xfa8a43,
  128: 0xf87c33,
  256: 0xf7712b,
  512: 0xf76c26,
  1024: 0xf76824,
  2048: C.primary,
  4096: C.accent,
  8192: C.accentDark,
};

/** Цвет для номиналов выше карты (16384+). */
const TILE_FALLBACK = C.ink;

/** Светлые плитки (2/4) — тёмный текст, остальные — белый. */
const DARK_TEXT_VALUES = new Set([2, 4]);

export function tileColor(value: number): number {
  return TILE_COLORS[value] ?? TILE_FALLBACK;
}

export function tileTextColor(value: number): string {
  return DARK_TEXT_VALUES.has(value) ? COLORS.headText : '#ffffff';
}

/** Размер шрифта номинала: уменьшается для 3–4-значных чисел. */
export function tileFontSize(value: number): number {
  const digits = String(value).length;
  if (digits <= 2) return 34;
  if (digits === 3) return 28;
  if (digits === 4) return 22;
  return 18;
}
