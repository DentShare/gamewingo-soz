/**
 * Феникс — маскот каталога.
 *
 * Рисуется примитивами, а не картинкой: любой размер без потери чёткости,
 * ноль байт в билде и ноль строк в реестре лицензий — тот же приём, что у
 * значков (`glyphs.ts`) и картинок пазла (`games/jigsaw/.../painters.ts`).
 *
 * Части лежат в отдельных контейнерах, поэтому анимируются по отдельности:
 * крыло машет, хохолок качается, корпус дышит, глаз моргает. Все твины
 * маскот держит у себя и убивает в `destroy()` — иначе они переживут сцену
 * (чеклист `webview-qa`, раздел про утечки).
 *
 * Единица `u` — сторона квадрата, в который вписана фигура; хвост и хохолок
 * выходят за него примерно на 15 %, это учтено в отступах вызывающих сцен.
 */
import type { Scene } from 'phaser';
import { C } from './tokens.js';
import { DUR, EASE } from './motion.js';

/** Настроение: определяет позу и мимику. */
export type PhoenixMood = 'idle' | 'happy' | 'sad';

export interface Phoenix {
  /** Корневой контейнер: двигать и масштабировать — через него. */
  root: Phaser.GameObjects.Container;
  setMood(mood: PhoenixMood): void;
  /** Взмах крылом и подскок — победа, награда, новый рекорд. */
  celebrate(): void;
  /** Поник: опустил крыло, прикрыл глаз — партия проиграна. */
  sink(): void;
  /** Моргнуть один раз. В покое зовётся сам, изредка. */
  blink(): void;
  destroy(): void;
}

/**
 * Тёмный тон бренда для теневых перьев. Отдельного токена не заводим:
 * это тот же оранжевый, что у нажатой кнопки, и разводить два почти
 * одинаковых значения в палитре вреднее, чем назвать его здесь.
 */
const DEEP = C.primaryPressed;

type Pt = [number, number];

function poly(g: Phaser.GameObjects.Graphics, pts: Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillPath();
}

/**
 * Перо-язык пламени: основание в (x, y), кончик на расстоянии `len` под углом `a`.
 * `bulge` задаёт, насколько раздуты бока: 0.3 читается как перо, 0.15 — как язык огня.
 */
function plume(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, len: number, width: number, a: number,
  color: number, bulge = 0.3,
): void {
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;
  const p = (t: number, w: number): Pt => [
    x + dx * len * t + nx * width * w,
    y + dy * len * t + ny * width * w,
  ];
  g.fillStyle(color, 1);
  poly(g, [
    [x, y],
    p(0.30, bulge * 2.6),
    p(0.68, bulge * 1.4),
    [x + dx * len, y + dy * len],
    p(0.68, -bulge * 1.4),
    p(0.30, -bulge * 2.6),
  ]);
}

/**
 * Собрать маскота. `size` — сторона условного квадрата (в меню 88–120,
 * на экране итога 96–140, в подсказках 56).
 *
 * `facing: 'left'` отражает фигуру — птица смотрит внутрь экрана, если стоит
 * у правого края.
 */
export function makePhoenix(
  scene: Scene,
  x: number,
  y: number,
  size = 96,
  opts: { facing?: 'left' | 'right' } = {},
): Phoenix {
  const u = size;
  const tweens: Phaser.Tweens.Tween[] = [];
  const track = (t: Phaser.Tweens.Tween) => { tweens.push(t); return t; };

  // --- хвост: три пера веером вниз-назад ---
  const tailG = scene.add.graphics();
  plume(tailG, 0, 0, 0.34 * u, 0.085 * u, Math.PI * 0.60, C.gold, 0.30);
  plume(tailG, 0, 0, 0.40 * u, 0.095 * u, Math.PI * 0.72, C.primary, 0.32);
  plume(tailG, 0, 0, 0.33 * u, 0.080 * u, Math.PI * 0.86, DEEP, 0.30);
  const tail = scene.add.container(-0.05 * u, 0.13 * u, [tailG]);

  // --- дальнее крыло: намёк, чтобы силуэт не разваливался ---
  const wingBackG = scene.add.graphics();
  plume(wingBackG, 0, 0, 0.30 * u, 0.10 * u, Math.PI * 1.30, DEEP, 0.34);
  const wingBack = scene.add.container(0.02 * u, -0.04 * u, [wingBackG]);

  // --- корпус, голова, клюв ---
  const bodyG = scene.add.graphics();
  bodyG.fillStyle(C.primary, 1);
  bodyG.fillEllipse(0, 0.02 * u, 0.38 * u, 0.50 * u);
  bodyG.fillStyle(C.primarySoft, 1);
  bodyG.fillEllipse(0.06 * u, 0.06 * u, 0.22 * u, 0.32 * u);
  bodyG.fillStyle(C.primary, 1);
  bodyG.fillCircle(0.09 * u, -0.27 * u, 0.155 * u);
  bodyG.fillStyle(C.gold, 1);
  poly(bodyG, [
    [0.21 * u, -0.30 * u],
    [0.38 * u, -0.25 * u],
    [0.21 * u, -0.21 * u],
  ]);
  const body = scene.add.container(0, 0, [bodyG]);

  // --- хохолок ---
  const crestG = scene.add.graphics();
  plume(crestG, 0.07 * u, -0.02 * u, 0.17 * u, 0.045 * u, -Math.PI * 0.50, C.gold, 0.26);
  plume(crestG, 0.01 * u, -0.01 * u, 0.21 * u, 0.050 * u, -Math.PI * 0.64, C.primarySoft, 0.26);
  plume(crestG, -0.05 * u, 0.03 * u, 0.16 * u, 0.042 * u, -Math.PI * 0.78, C.gold, 0.26);
  const crest = scene.add.container(0.02 * u, -0.36 * u, [crestG]);

  // --- глаз: отдельно, потому что должен уметь моргать и щуриться ---
  const eyeG = scene.add.graphics();
  eyeG.fillStyle(C.ink, 1);
  eyeG.fillCircle(0, 0, 0.030 * u);
  eyeG.fillStyle(C.white, 1);
  eyeG.fillCircle(0.012 * u, -0.013 * u, 0.011 * u);
  const eye = scene.add.container(0.14 * u, -0.29 * u, [eyeG]);

  // --- ближнее крыло ---
  const wingFrontG = scene.add.graphics();
  plume(wingFrontG, 0, 0, 0.31 * u, 0.10 * u, Math.PI * 1.08, DEEP, 0.34);
  plume(wingFrontG, 0, 0, 0.39 * u, 0.12 * u, Math.PI * 1.18, C.primary, 0.36);
  plume(wingFrontG, 0, 0, 0.32 * u, 0.10 * u, Math.PI * 1.30, C.primarySoft, 0.32);
  const wingFront = scene.add.container(-0.01 * u, -0.06 * u, [wingFrontG]);

  const root = scene.add.container(x, y, [tail, wingBack, body, crest, eye, wingFront]);
  if (opts.facing === 'left') root.setScale(-1, 1);

  // Дыхание и покачивание хвоста — фигура не выглядит наклейкой.
  track(scene.tweens.add({
    targets: body, scaleY: 1.035, duration: DUR.breath,
    yoyo: true, repeat: -1, ease: EASE.smooth,
  }));
  track(scene.tweens.add({
    targets: tail, angle: 3, duration: DUR.breath * 1.3,
    yoyo: true, repeat: -1, ease: EASE.smooth,
  }));
  track(scene.tweens.add({
    targets: crest, angle: -4, duration: DUR.breath * 0.9,
    yoyo: true, repeat: -1, ease: EASE.smooth,
  }));

  const blink = () => {
    scene.tweens.add({
      targets: eye, scaleY: 0.1, duration: 70, yoyo: true, ease: EASE.settle,
    });
  };
  // Моргание вразнобой: ровный интервал выглядит механическим.
  const blinker = scene.time.addEvent({
    delay: 3200, loop: true,
    callback: () => { if (Math.random() < 0.7) blink(); },
  });

  let mood: PhoenixMood = 'idle';

  const setMood = (next: PhoenixMood) => {
    mood = next;
    if (next === 'sad') {
      scene.tweens.add({ targets: wingFront, angle: 26, duration: 340, ease: EASE.settle });
      scene.tweens.add({ targets: crest, angle: 16, duration: 340, ease: EASE.settle });
      scene.tweens.add({ targets: eye, scaleY: 0.45, duration: 340, ease: EASE.settle });
      scene.tweens.add({ targets: body, y: 0.03 * u, duration: 340, ease: EASE.settle });
    } else {
      scene.tweens.add({ targets: [wingFront, crest], angle: 0, duration: 260, ease: EASE.settle });
      scene.tweens.add({ targets: eye, scaleY: 1, duration: 200, ease: EASE.settle });
      scene.tweens.add({ targets: body, y: 0, duration: 260, ease: EASE.settle });
    }
  };

  const celebrate = () => {
    setMood('happy');
    // Взмах: крыло уходит вверх и возвращается — дважды, как настоящий хлопок.
    scene.tweens.add({
      targets: wingFront, angle: -34, duration: 160,
      yoyo: true, repeat: 1, ease: EASE.settle,
    });
    scene.tweens.add({
      targets: wingBack, angle: 22, duration: 160,
      yoyo: true, repeat: 1, ease: EASE.settle,
    });
    // Подскок с приседанием на приземлении.
    scene.tweens.add({
      targets: root, y: y - 0.14 * u, duration: 220, yoyo: true, ease: EASE.pop,
      onComplete: () => {
        scene.tweens.add({
          targets: body, scaleX: 1.1, scaleY: 0.9, duration: 100, yoyo: true, ease: EASE.settle,
        });
      },
    });
  };

  const sink = () => {
    setMood('sad');
    scene.tweens.add({
      targets: root, y: y + 0.05 * u, duration: 420, ease: EASE.settle,
    });
  };

  return {
    root,
    setMood,
    celebrate,
    sink,
    blink,
    destroy: () => {
      // Твины и таймер переживают сцену, если их не убить руками.
      blinker.remove();
      for (const t of tweens) t.stop();
      scene.tweens.killTweensOf([root, body, tail, crest, eye, wingFront, wingBack]);
      root.destroy();
    },
    get mood() { return mood; },
  } as Phoenix;
}
