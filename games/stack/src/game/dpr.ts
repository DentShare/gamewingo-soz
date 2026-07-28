/**
 * Плотность пикселей устройства (retina/высокий DPI). Рендерим холст в DPR раз плотнее,
 * чтобы картинка была чёткой, а не мыльной. Ограничиваем до 3 (выше — лишняя нагрузка).
 */
export const DPR = Math.min(
  typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1,
  3,
);

/** Логический размер игрового поля (в этих координатах пишется вся вёрстка). */
export const LOGICAL_W = 400;
export const LOGICAL_H = 720;
