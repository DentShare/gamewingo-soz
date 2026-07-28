/** Бандл-шрифт с покрытием кириллица + латиница + ʻ (U+02BB). Фолбэк — системный sans-serif. */
export const FONT = 'Rubik, sans-serif';

/** Централизованная палитра (светлая тема WinGo — общая для каталога). */
export const COLORS = {
  bg: 0xfbebe1,            // светлый персиковый фон WinGo
  headText: '#241a12',     // заголовки/основной текст
  headMuted: '#8a7a6d',    // приглушённый текст
  panel: 0xffffff,         // белые карточки/кнопки
  panelBorder: 0xe7d3c7,
  primary: 0xf26522,       // WinGo оранжевый (дефолт CTA, если тема не задана)
  iconDark: 0x3a2a1f,      // векторные иконки
  tile: 0xf26522,          // лицевая часть плитки
  tileText: '#ffffff',     // цифра на плитке
  boardWell: 0xf3d9c9,     // «лунка» поля под плитками
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],
};
