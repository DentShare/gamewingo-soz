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
  board: C.surface,        // подложка игрового поля
  boardAlt: C.slot,        // клетки «шахматки»
  boardEdge: C.divider,    // рамка поля
  snakeBody: C.accent,     // тело змейки
  snakeBodyAlt: C.accentSoft, // чередующийся сегмент
  snakeHead: C.accentDark, // голова темнее тела
  snakeEye: C.white,
  snakeEyeDot: C.ink,
  food: C.primary,         // еда
  foodShine: '#ffebe2',    // блик на еде
  crash: C.danger,         // вспышка при столкновении
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,
};
