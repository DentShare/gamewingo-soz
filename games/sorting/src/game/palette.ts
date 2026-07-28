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
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],

  // ── Игровые цвета «Сортировки» ───────────────────────────────────────────────
  /** Цвета фигурок и цветных корзин (яркие, различимые для малышей). */
  red: 0xe8453c,
  yellow: 0xf6c026,
  blue: 0x2f80ed,
  /** Нейтральная корзина режима «по форме» (различается только формой). */
  binNeutral: 0xf3e4da,
  /** Площадка, с которой ребёнок берёт фигурку. */
  tray: 0xffffff,
  /** Верный ответ — зелёная вспышка. */
  correct: 0x2fb84c,
  /** Подсказка «вот сюда» после промаха. */
  hint: 0xf26522,
};

/** Цвет фигурки по её признаку. */
export const FIGURE_COLORS: Record<'red' | 'yellow' | 'blue', number> = {
  red: COLORS.red,
  yellow: COLORS.yellow,
  blue: COLORS.blue,
};
