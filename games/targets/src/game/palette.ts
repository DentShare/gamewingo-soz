/** Бандл-шрифт с покрытием кириллица + латиница + ʻ (U+02BB). Фолбэк — системный sans-serif. */
export const FONT = 'Rubik, sans-serif';

/**
 * Централизованная палитра (светлая тема WinGo — общая для каталога).
 * Ключи `bg…toastText` используются `ui.ts` и совпадают с остальными играми каталога;
 * `target*` — специфика «Меткого глаза».
 */
export const COLORS = {
  bg: 0xfbebe1,            // светлый персиковый фон WinGo
  headText: '#241a12',     // заголовки/основной текст
  headMuted: '#8a7a6d',    // приглушённый текст
  panel: 0xffffff,         // белые карточки/кнопки
  panelBorder: 0xe7d3c7,
  primary: 0xf26522,       // WinGo оранжевый (дефолт CTA, если тема не задана)
  iconDark: 0x3a2a1f,      // векторные иконки
  cardBack: 0xf26522,      // совместимость с общими компонентами каталога
  cardBackMark: '#ffd9c2',
  matchGlow: 0x2fb84c,     // подсветка удачного действия (зелёный WinGo)
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],

  // ── Специфика «Меткого глаза» ───────────────────────────────────────────────
  field: 0xf6ded0,         // игровое поле (чуть темнее фона)
  fieldBorder: 0xe7d3c7,
  targetRing: 0xf26522,    // внешнее кольцо обычной цели
  targetMid: 0xffffff,     // среднее кольцо
  targetCore: 0xf26522,    // «яблочко»
  goldenRing: 0xd99a12,    // золотая цель
  goldenMid: 0xfff3cf,
  goldenCore: 0xd99a12,
  ripple: 0x8a7a6d,        // волна на месте промаха
  popText: '#2fb84c',      // всплывающие «+N» за обычную цель
  popGolden: '#c47f05',    // всплывающие «+N» за золотую
  comboText: '#f26522',    // серия в HUD
  timeLow: '#d13b2e',      // таймер на последних секундах
};
