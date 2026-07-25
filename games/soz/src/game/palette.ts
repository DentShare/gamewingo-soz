import type { UnitStatus } from '../core/evaluate';

/** Бандл-шрифт с покрытием кириллица + латиница + ʻ (U+02BB). Фолбэк — системный sans-serif. */
export const FONT = 'Rubik, sans-serif';

export interface Palette {
  correct: number;
  present: number;
  absent: number;
}

/** Статусы плиток в стиле WinGo: зелёный (бренд) / тёплый янтарный / тёплый серый. */
export const NORMAL: Palette = { correct: 0x2fb84c, present: 0xeb9d2e, absent: 0x8d7f72 };
/** High-contrast для дальтоников: оранжевый / синий. */
export const HIGH_CONTRAST: Palette = { correct: 0xf5793a, present: 0x2b8ce6, absent: 0x8d7f72 };

/** Централизованная палитра (светлая тема WinGo). Точные hex подгоняются здесь. */
export const COLORS = {
  bg: 0xfbebe1,            // светлый персиковый фон WinGo
  emptyBorder: 0xe7d3c7,   // граница пустой плитки
  filledBorder: 0xc2a38c,  // граница набранной плитки
  keyDefault: 0xece0d6,    // светлая клавиша
  digraphKey: 0xf7d3bf,    // диграф-клавиша: светлый оранжевый тинт (не путать со статусами)
  keyText: '#3a2a1f',      // тёмный текст на клавише
  iconDark: 0x3a2a1f,      // иконки Enter/Backspace
  tileTextDark: '#2a211a', // текст на пустой/набранной плитке (тёмный, светлый фон)
  tileTextLight: '#ffffff',// текст на цветной плитке
  headText: '#241a12',     // заголовки/основной текст
  headMuted: '#8a7a6d',    // приглушённый текст
  panel: 0xffffff,         // белые карточки/кнопки
  panelBorder: 0xe7d3c7,
  panelHover: 0xf5e8df,    // ховер светлой кнопки
  primary: 0xf26522,       // WinGo оранжевый (дефолт CTA, если тема не задана)
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],
};

export function paletteFor(highContrast: boolean): Palette {
  return highContrast ? HIGH_CONTRAST : NORMAL;
}

export function statusColor(status: UnitStatus, p: Palette): number {
  return p[status];
}
