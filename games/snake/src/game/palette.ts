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
  board: 0xf4e4d5,         // подложка игрового поля
  boardAlt: 0xeeddcc,      // клетки «шахматки» поля (мягкий контраст для читаемости хода)
  boardEdge: 0xe0c6b1,     // рамка поля
  snakeBody: 0x2fb84c,     // тело змейки (зелёный WinGo)
  snakeBodyAlt: 0x27a343,  // чередующийся сегмент — «чешуя»
  snakeHead: 0x1f8c39,     // голова темнее тела
  snakeEye: 0xffffff,
  snakeEyeDot: 0x1a3d22,
  food: 0xf26522,          // еда — оранжевая «ягода»
  foodShine: '#ffd9c2',    // блик на еде
  crash: 0xe8443a,         // вспышка при столкновении
  toastBg: '#2a211a',
  toastText: '#ffffff',
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: [251, 235, 225] as [number, number, number],
};
