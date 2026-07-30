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
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Специфика «Счёта» ────────────────────────────────────────────────────
  board: C.surface,        // белое поле с предметами
  boardBorder: C.divider,
  padFace: C.surface,      // кнопка-цифра
  padText: S.ink,          // крупная цифра на кнопке
  praise: S.accent,        // «Молодец!»
  helpText: S.primary,     // «Посчитаем вместе!»
  countGlow: C.tint,       // подсветка предмета при пересчёте
  countNumber: S.primary,  // всплывающая цифра
  sparkle: C.gold,         // искорки при верном ответе
};
