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

  // ── Специфика «Счёта» ────────────────────────────────────────────────────
  board: 0xffffff,         // белое поле с предметами
  boardBorder: 0xf0dccf,
  padFace: 0xffffff,       // кнопка-цифра
  padText: '#241a12',      // крупная цифра на кнопке
  praise: '#2fb84c',       // «Молодец!» — зелёный WinGo
  helpText: '#f26522',     // «Посчитаем вместе!» — оранжевый
  countGlow: 0xffd9c2,     // круг подсветки предмета при пересчёте
  countNumber: '#f26522',  // всплывающая цифра 1, 2, 3… при пересчёте
  sparkle: 0xffc247,       // искорки при верном ответе
};
