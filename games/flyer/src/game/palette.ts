/** Бандл-шрифт с покрытием кириллица + латиница + ʻ (U+02BB). Фолбэк — системный sans-serif. */
export const FONT = 'Rubik, sans-serif';

/**
 * Палитра: база — общая светлая тема WinGo (как у остальных игр каталога),
 * плюс «небесные» цвета игрового поля (небо/земля/стены/герой).
 * Ключи bg, headText, headMuted, panel, panelBorder, primary, iconDark,
 * toastBg, toastText, fade — контракт для `ui.ts`, не переименовывать.
 */
export const COLORS = {
  bg: 0xfbebe1,            // светлый персиковый фон WinGo (меню и результат)
  headText: '#241a12',     // заголовки/основной текст
  headMuted: '#8a7a6d',    // приглушённый текст
  panel: 0xffffff,         // белые карточки/кнопки
  panelBorder: 0xe7d3c7,
  primary: 0xf26522,       // WinGo оранжевый (дефолт CTA, если тема не задана)
  iconDark: 0x3a2a1f,      // векторные иконки

  // ── Игровое поле ───────────────────────────────────────────────────────────
  skyTop: 0x9fd4ef,        // верх градиента неба
  skyBottom: 0xe8f6fd,     // низ градиента неба
  cloud: 0xffffff,
  ground: 0xe3b579,        // песчаная полоса внизу (в тон каталогу)
  groundDark: 0xc99659,
  // Препятствия — брендовые оранжевые «маяки»: свой силуэт и палитра каталога,
  // никакого сходства с оформлением известных tap-игр (зелёные трубы с пояском).
  wall: 0xf2822a,
  wallDark: 0xc4551a,
  wallLight: 0xffb066,
  wallGlow: 0xffd9b8,      // светлая вставка у торца, смотрящего в проём
  hero: 0xf26522,          // корпус героя — брендовый оранжевый
  heroDark: 0xc44e17,
  scoreText: '#ffffff',    // крупный счёт поверх неба
  scoreShadow: '#1d3a4b',

  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],
};
