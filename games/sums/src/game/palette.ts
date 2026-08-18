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
  danger: S.danger,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Специфика «Сумм» ──────────────────────────────────────────────────────
  cellBg: C.surface,        // клетка с числом
  cellText: S.ink,
  crossedBg: C.slot,        // вычеркнутая клетка — вдавленная и тихая
  crossedText: S.muted,
  strike: C.muted,          // линия перечёркивания
  targetBg: C.slot,         // плашка целевой суммы строки/столбца
  targetText: S.ink,
  targetDoneBg: C.successBg, // сумма сошлась
  targetDoneText: S.success,
  targetOverBg: C.dangerBg,  // вычеркнуто лишнее: сумма уже меньше цели
  targetOverText: S.danger,
  gridLine: C.divider,
};
