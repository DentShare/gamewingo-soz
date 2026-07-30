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
