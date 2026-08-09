/**
 * Характер движения каталога: один набор easing и три приёма, которыми
 * анимируется всё остальное.
 *
 * Смысл файла — не в экономии строк, а в единстве: когда каждая сцена
 * подбирает длительность и кривую на глаз, интерфейс ощущается разнобоем.
 * Здесь заданы правила, а сцены их применяют.
 *
 * Ноль килобайт: искры рисуются текстурой, сгенерированной в рантайме,
 * а не спрайтом из `public/` — см. `ensureDot`.
 */
import type { Scene } from 'phaser';
import { C } from './tokens.js';

/**
 * Кривые каталога. Правило простое: появление — `pop`, исчезновение — `in`,
 * реакция на действие игрока — `settle`, непрерывное движение — `smooth`.
 */
export const EASE = {
  /** Появление с лёгким перелётом: карточки, звёзды, кнопки. */
  pop: 'Back.easeOut',
  /** Уход со сцены: улетающие бонусы, закрытие подсказок. */
  in: 'Cubic.easeIn',
  /** Отклик на тап: короткий, без перелёта. */
  settle: 'Quad.easeOut',
  /** Бесконечные покачивания: дыхание маскота, парение. */
  smooth: 'Sine.easeInOut',
} as const;

/** Длительности. Больше 400 мс на отклик — интерфейс начинает казаться вялым. */
export const DUR = {
  tap: 120,
  appear: 280,
  move: 420,
  breath: 1800,
} as const;

/** Ключ текстуры-точки для искр. Одна на игру, создаётся лениво. */
export const DOT_KEY = 'wingo-dot';

/** Создать текстуру-точку, если её ещё нет в этой игре. */
function ensureDot(scene: Scene): void {
  if (scene.textures.exists(DOT_KEY)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 8);
  g.generateTexture(DOT_KEY, 16, 16);
  g.destroy();
}

/** Появление объекта: из нуля с перелётом. Возвращает твин — его можно отменить. */
export function pop(
  scene: Scene,
  target: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
  opts: { from?: number; to?: number; duration?: number; delay?: number } = {},
): Phaser.Tweens.Tween {
  const to = opts.to ?? 1;
  const list = Array.isArray(target) ? target : [target];
  for (const item of list) {
    (item as unknown as { setScale?: (v: number) => void }).setScale?.(opts.from ?? 0);
  }
  return scene.tweens.add({
    targets: list,
    scale: to,
    duration: opts.duration ?? DUR.appear,
    delay: opts.delay ?? 0,
    ease: EASE.pop,
  });
}

/**
 * Приседание и отскок: предмет приземлился, кнопка приняла нажатие, плитка встала.
 * Без этого движение выглядит «бумажным» — объект будто не имеет веса.
 */
export function squash(
  scene: Scene,
  target: Phaser.GameObjects.GameObject,
  opts: { amount?: number; duration?: number } = {},
): Phaser.Tweens.Tween {
  const amount = opts.amount ?? 0.16;
  const base = (target as unknown as { scaleX: number; scaleY: number });
  return scene.tweens.add({
    targets: target,
    scaleX: base.scaleX * (1 + amount),
    scaleY: base.scaleY * (1 - amount),
    duration: opts.duration ?? DUR.tap,
    yoyo: true,
    ease: EASE.settle,
  });
}

/**
 * Искры в точке события: закрылось испытание, встала последняя деталь,
 * прилетел бонус. Эмиттер самоуничтожается — вызывать можно откуда угодно.
 */
export function sparkle(
  scene: Scene,
  x: number,
  y: number,
  opts: { colors?: number[]; count?: number; power?: number; depth?: number } = {},
): void {
  ensureDot(scene);
  const colors = opts.colors ?? [C.primary, C.gold, C.primarySoft];
  const power = opts.power ?? 1;
  const emitter = scene.add.particles(x, y, DOT_KEY, {
    speed: { min: 50 * power, max: 200 * power },
    lifespan: 620,
    quantity: 1,
    scale: { start: 0.42, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: colors,
    gravityY: 240,
    emitting: false,
  }).setDepth(opts.depth ?? 2200);

  emitter.explode(opts.count ?? 18);
  // Живём чуть дольше самой долгой частицы и убираемся сами.
  scene.time.delayedCall(900, () => emitter.destroy());
}

/**
 * Мягкая пульсация — «сюда смотреть»: активное испытание, кнопка продолжения.
 * Возвращает твин, чтобы сцена могла его остановить.
 */
export function pulse(
  scene: Scene,
  target: Phaser.GameObjects.GameObject,
  opts: { scale?: number; duration?: number } = {},
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale: opts.scale ?? 1.06,
    duration: opts.duration ?? 900,
    yoyo: true,
    repeat: -1,
    ease: EASE.smooth,
  });
}
