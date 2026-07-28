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
  board: 0xe9d2c0,         // подложка игрового поля
  boardCell: 0xf4e4d5,     // пустой слот поля
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],
};

/**
 * Карта цветов плиток по номиналам: тёплая шкала от кремового (2)
 * к оранжевому WinGo (2048) и тёмно-коричневому (4096+).
 */
export const TILE_COLORS: Record<number, number> = {
  2: 0xfdf3e7,
  4: 0xfae3c4,
  8: 0xf8cd97,
  16: 0xf7b871,
  32: 0xf6a355,
  64: 0xf68e43,
  128: 0xf47f35,
  256: 0xf3752d,
  512: 0xf26d27,
  1024: 0xf26924,
  2048: 0xf26522,
  4096: 0x6b4a35,
  8192: 0x54382a,
};

/** Цвет для номиналов выше карты (16384+). */
const TILE_FALLBACK = 0x40291e;

/** Светлые плитки (2/4) — тёмный текст, остальные — белый. */
const DARK_TEXT_VALUES = new Set([2, 4]);

export function tileColor(value: number): number {
  return TILE_COLORS[value] ?? TILE_FALLBACK;
}

export function tileTextColor(value: number): string {
  return DARK_TEXT_VALUES.has(value) ? COLORS.headText : '#ffffff';
}

/** Размер шрифта номинала: уменьшается для 3–4-значных чисел. */
export function tileFontSize(value: number): number {
  const digits = String(value).length;
  if (digits <= 2) return 34;
  if (digits === 3) return 28;
  if (digits === 4) return 22;
  return 18;
}
