import type { Scene } from 'phaser';
import { makeBrush, PAINTERS, SIZE } from './painters';
import { pictureById } from '../core/pictures';

/**
 * Готовит текстуру картинки и нарезает её на кусочки.
 *
 * Источник картинки — сменный: если у записи манифеста есть `src`, берётся
 * загруженный файл (купленный набор иллюстраций), иначе рисуется векторная
 * сцена каталога. Дальше всё одинаково: текстура режется на кадры-кусочки,
 * и сцена сборки не знает, откуда картинка взялась.
 */

/**
 * Сторона текстуры картинки. Совпадает с полем сборки, чтобы кусочки были
 * пиксель в пиксель; экран истории показывает ту же текстуру уменьшенной.
 */
export const PICTURE_SIZE = 336;

/** Ключ текстуры картинки. */
export function pictureTextureKey(id: string): string {
  return `picture-${id}`;
}

/**
 * Кадр целой картинки. Указывать его обязательно: как только в текстуру
 * добавлены кадры-кусочки, кадром по умолчанию становится первый из них,
 * и картинка «целиком» показала бы левый верхний фрагмент.
 */
export const BASE_FRAME = '__BASE';

/** Ключ кадра одного кусочка. */
export function pieceFrameKey(slot: number): string {
  return `p${slot}`;
}

/** Создаёт (если ещё нет) текстуру картинки размера PICTURE_SIZE. */
export function ensurePictureTexture(scene: Scene, id: string): string {
  const key = pictureTextureKey(id);
  if (scene.textures.exists(key)) return key;

  const picture = pictureById(id);
  if (picture.src && scene.textures.exists(id)) {
    // Готовая иллюстрация уже загружена Preloader-ом — приводим к рабочему размеру.
    const source = scene.textures.get(id).getSourceImage() as CanvasImageSource;
    const canvas = scene.textures.createCanvas(key, PICTURE_SIZE, PICTURE_SIZE);
    canvas?.context.drawImage(source, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
    canvas?.refresh();
    return key;
  }

  // Плейсхолдер: сцена рисуется сразу в рабочем масштабе — кисть умножает
  // координаты. Трансформация Graphics тут не помощник: generateTexture
  // пишет буфер команд и масштаб игрового объекта не учитывает.
  const paint = PAINTERS[id] ?? PAINTERS['sunny-day'];
  const g = scene.make.graphics({}, false);
  paint(makeBrush(g, PICTURE_SIZE / SIZE));
  g.generateTexture(key, PICTURE_SIZE, PICTURE_SIZE);
  g.destroy();
  return key;
}

/** Добавляет в текстуру кадры под сетку cols × rows (по разу на текстуру). */
export function sliceIntoPieces(scene: Scene, key: string, cols: number, rows: number): void {
  const texture = scene.textures.get(key);
  const pw = PICTURE_SIZE / cols;
  const ph = PICTURE_SIZE / rows;
  for (let slot = 0; slot < cols * rows; slot++) {
    const name = pieceFrameKey(slot);
    if (texture.has(name)) continue;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    texture.add(name, 0, col * pw, row * ph, pw, ph);
  }
}

/** Текстура картинки, нарезанная на кусочки под сетку уровня. */
export function buildPictureTexture(scene: Scene, id: string, cols: number, rows: number): string {
  const key = ensurePictureTexture(scene, id);
  sliceIntoPieces(scene, key, cols, rows);
  return key;
}

/** Загружает готовые иллюстрации набора (у кого задан `src`). Вызывается в Boot.preload. */
export function preloadPictures(scene: Scene, pictures: readonly { id: string; src?: string }[]): void {
  for (const p of pictures) {
    if (p.src) scene.load.image(p.id, p.src);
  }
}
