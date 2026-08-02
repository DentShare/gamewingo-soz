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
  cardBack: C.primary,        // рубашка карточки
  cardBackMark: '#ffebe2', // знак «?» на рубашке
  matchGlow: C.accent,        // подсветка найденной пары
  /** Обратный отсчёт на исходе и сообщение о проваленном уровне. */
  danger: S.danger,
  star: C.gold,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,
};
