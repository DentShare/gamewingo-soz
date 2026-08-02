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
  /** Силуэт формы на нейтральной корзине — мягче чёрного. */
  binGlyph: C.muted,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Игровые цвета «Сортировки» ───────────────────────────────────────────────
  /** Цвета фигурок и цветных корзин (яркие, различимые для малышей). */
  red: 0xe8453c,
  yellow: 0xf6c026,
  blue: 0x2f80ed,
  /** Четвёртый цвет — появляется только на поздних уровнях лестницы. */
  green: 0x3aa657,
  /** Нейтральная корзина режима «по форме» (различается только формой). */
  binNeutral: C.slot,
  /** Площадка, с которой ребёнок берёт фигурку. */
  tray: C.surface,
  /** Верный ответ — зелёная вспышка. */
  correct: C.accent,
  /** Подсказка «вот сюда» после промаха. */
  hint: C.primary,
};

/** Цвет фигурки по её признаку. */
export const FIGURE_COLORS: Record<'red' | 'yellow' | 'blue' | 'green', number> = {
  green: COLORS.green,
  red: COLORS.red,
  yellow: COLORS.yellow,
  blue: COLORS.blue,
};
