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

  // ── Собственное для «Башни» ────────────────────────────────────────────────
  /** Тень под башней/лёгкая подложка поля. */
  shade: 0xf3ddd0,
  /** Вспышка идеального попадания. */
  perfect: 0x2fb84c,
  /** Крупный счёт во время партии. */
  scoreText: '#241a12',
  /** Отрезанный кусок — чуть бледнее блока (альфа задаётся в сцене). */
  cutAlpha: 0.85,
};

/** HSV (h° 0..360, s/v 0..1) → 0xRRGGBB. */
export function hsv(h: number, s: number, v: number): number {
  const c = v * s;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] :
    hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  const to255 = (n: number) => Math.round((n + m) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

/**
 * Цвет блока по его индексу в башне: плавный градиент от брендового оранжевого
 * по кругу оттенков — башня выглядит «радужной», но остаётся в тёплой гамме WinGo.
 */
export function blockColor(index: number): number {
  return hsv(22 + index * 9, 0.62, 0.94);
}
