import type { Scene } from 'phaser';

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

/**
 * Высота холста под пропорции конкретного экрана. Вёрстка остаётся в 400×720,
 * но холст вытягивается по высоте телефона — иначе Scale.FIT оставляет полосы
 * сверху и снизу. Никогда не меньше LOGICAL_H, чтобы вёрстка всегда помещалась.
 */
export const VIEW_H = (() => {
  if (typeof window === 'undefined') return LOGICAL_H;
  const { innerWidth: w, innerHeight: h } = window;
  if (!w || !h) return LOGICAL_H;
  return Math.min(1024, Math.max(LOGICAL_H, Math.round((LOGICAL_W * h) / w)));
})();

/** Мировые координаты верхней и нижней кромки экрана (вёрстка центрируется по 360). */
export const VIEW_TOP = LOGICAL_H / 2 - VIEW_H / 2;
export const VIEW_BOTTOM = LOGICAL_H / 2 + VIEW_H / 2;

/** Настраивает камеру сцены на плотный рендер: zoom = DPR, вёрстка в логических 400×720. */
export function setupCamera(scene: Scene): void {
  scene.cameras.main.setZoom(DPR);
  scene.cameras.main.centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
}

/**
 * Тряска камеры с прежней амплитудой. Phaser считает смещение как
 * `intensity × ширина камеры × zoom²`, а после уплотнения холста и ширина, и зум
 * выросли в DPR раз — делим интенсивность на DPR², чтобы тряска выглядела так же.
 */
export function shakeCamera(scene: Scene, duration: number, intensity: number): void {
  scene.cameras.main.shake(duration, intensity / (DPR * DPR));
}
