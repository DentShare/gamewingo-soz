/**
 * Феникс — маскот каталога (v2).
 *
 * Рисуется примитивами, а не картинкой: любой размер без потери чёткости,
 * ноль байт в билде и ноль строк в реестре лицензий — тот же приём, что у
 * значков (`glyphs.ts`) и картинок пазла (`games/jigsaw/.../painters.ts`).
 *
 * v2 по макету «Феникс v2»: перья двухслойные (перо + светлое опахало), хвост
 * из пяти перьев, крыло из трёх маховых и трёх кроющих, градиент на корпусе и
 * голове, двухтонный клюв, тень под птицей и угли от хвоста. В покое живут семь
 * движений с разными периодами — поэтому фигура не повторяется глазу.
 *
 * Геометрия описана в квадрате 120×120 с якорем у ног (60, 98) и масштабируется
 * под `size`. Снаружи всё как у v1: (x, y) — центр фигуры, `size` — её рост,
 * поэтому сцены, которые ставили маскота раньше, двигать не нужно.
 *
 * Все твины маскот держит у себя и убивает в `destroy()` — иначе они переживут
 * сцену (чеклист `webview-qa`, раздел про утечки).
 */
import type { Scene } from 'phaser';
import { C, PHOENIX_SHADES } from './tokens.js';
import { motionAllowed } from './motion.js';

/**
 * Настроение: определяет позу и движение.
 * `fly` — парение (заставки, переходы), `curious` — наклон головы на тап.
 */
export type PhoenixMood = 'idle' | 'happy' | 'sad' | 'fly' | 'curious';

export interface Phoenix {
  /** Корневой контейнер: двигать и масштабировать — через него. */
  root: Phaser.GameObjects.Container;
  setMood(mood: PhoenixMood): void;
  /** Подскок с двумя взмахами — победа, награда, новый рекорд. */
  celebrate(): void;
  /** Поник: опустил крыло и хохолок, прикрыл глаз, угли погасли — партия проиграна. */
  sink(): void;
  /** Моргнуть один раз. В покое моргает и сам. */
  blink(): void;
  destroy(): void;
  readonly mood: PhoenixMood;
}

const P = {
  primary: C.primary,
  pressed: C.primaryPressed,
  soft: C.primarySoft,
  gold: C.gold,
  ink: C.ink,
  white: C.white,
  ...PHOENIX_SHADES,
};

/**
 * Силуэт v2 занимает не весь квадрат 120×120, а примерно 72×101 (центр — на 40
 * единиц выше якоря у ног). Старый маскот заполнял квадрат целиком, и сцены
 * подбирали `size` под него. Чтобы при том же `size` птица осталась того же
 * роста, геометрию доувеличиваем на `FILL`.
 */
const CENTER_ABOVE_ANCHOR = 40;
const FILL = 1.18;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Перо — сужающаяся к концу капля вдоль угла `a`, длиной `len`, полушириной `w`.
 * Контур строится отрезками: так на слабом GPU дешевле, чем кривыми.
 */
function featherPath(
  g: Phaser.GameObjects.Graphics,
  len: number, w: number, a: number, bulge: number,
): void {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  const at = (t: number, k: number): [number, number] =>
    [dx * len * t + nx * w * k, dy * len * t + ny * w * k];
  const side = (t: number) => bulge * 2.6 * Math.sin(Math.PI * t) * (1 - t * 0.35);

  g.beginPath();
  const [x0, y0] = at(0, 0);
  g.moveTo(x0, y0);
  for (let i = 1; i <= 8; i++) { const t = i / 8; const [x, y] = at(t, side(t)); g.lineTo(x, y); }
  for (let i = 8; i >= 0; i--) { const t = i / 8; const [x, y] = at(t, -side(t)); g.lineTo(x, y); }
  g.closePath();
  g.fillPath();
}

/** Перо с необязательным светлым опахалом поверх — отдельный контейнер, чтобы качать его отдельно. */
function plume(
  scene: Scene,
  len: number, w: number, a: number, color: number,
  vane?: number, bulge = 0.3,
): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  featherPath(g, len, w, a, bulge);
  const parts: Phaser.GameObjects.GameObject[] = [g];
  if (vane !== undefined) {
    const v = scene.add.graphics({ x: Math.cos(a) * len * 0.14, y: Math.sin(a) * len * 0.14 });
    v.fillStyle(vane, 1);
    featherPath(v, len * 0.72, w * 0.42, a, 0.28);
    parts.push(v);
  }
  return scene.add.container(0, 0, parts);
}

/**
 * Собрать маскота. `size` — сторона условного квадрата (на итогах 84–140,
 * в меню 88–120, в подсказках 56). Угли от хвоста — только при `size ≥ 84`:
 * мельче их не видно, а кадры они стоят.
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
  const s = (size / 120) * FILL;
  const PI = Math.PI;
  const full = motionAllowed();

  const root = scene.add.container(x, y + CENTER_ABOVE_ANCHOR * s);
  root.setScale(opts.facing === 'left' ? -s : s, s);

  // ── Тень: дышит вместе с корпусом, сжимается в прыжке ──
  const shadow = scene.add.ellipse(0, 0, 44, 8, P.ink, 0.14);
  // Всё, что подпрыгивает и оседает, — в одном контейнере; тень остаётся на земле.
  const bird = scene.add.container(0, 0);
  root.add([shadow, bird]);

  // ── Хвост: пять перьев веером + угли ──
  const tail = scene.add.container(-7, -21);
  const tailPlumes = [
    plume(scene, 27, 6.5, PI * 0.97, P.deep, undefined, 0.28),
    plume(scene, 33, 8, PI * 0.86, P.pressed, P.tailMid),
    plume(scene, 40, 9.5, PI * 0.72, P.primary, P.peach, 0.32),
    plume(scene, 34, 8.5, PI * 0.60, P.gold, P.goldLight),
    plume(scene, 27, 6, PI * 0.50, P.soft, undefined, 0.28),
  ];
  tail.add(tailPlumes);
  const embers: Phaser.GameObjects.Arc[] = [];
  if (size >= 84) {
    const specs: [number, number, number, number][] = [
      [-23, 27, 1.6, P.gold],
      [-13, 30, 1.3, P.soft],
      [-29, 21, 1.2, P.goldLight],
    ];
    for (const [ex, ey, r, col] of specs) {
      const e = scene.add.circle(ex, ey, r, col).setAlpha(0);
      tail.add(e);
      embers.push(e);
    }
  }
  bird.add(tail);

  // ── Дальнее крыло: темнее и чуть прозрачнее, чтобы ушло в глубину ──
  const wingBack = scene.add.container(0, -38).setAlpha(0.92);
  wingBack.add([
    plume(scene, 25, 8, PI * 1.21, P.deep, undefined, 0.3),
    plume(scene, 30, 10, PI * 1.30, P.pressed, undefined, 0.34),
  ]);
  bird.add(wingBack);

  // ── Корпус: градиент, тень на боку, светлое брюшко ──
  const body = scene.add.container(-2, -7);
  const bodyG = scene.add.graphics();
  bodyG.fillGradientStyle(P.soft, P.primary, P.primary, P.pressed, 1).fillEllipse(0, -25, 38, 50);
  bodyG.fillStyle(P.pressed, 0.3).fillEllipse(-6, -19, 20, 30);
  bodyG.fillStyle(P.soft, 1).fillEllipse(6, -21, 22, 32);
  bodyG.fillStyle(P.peach, 0.65).fillEllipse(8, -25, 10, 22);
  body.add(bodyG);
  bird.add(body);

  // ── Голова: хохолок из четырёх перьев, щека, двухтонный клюв ──
  const head = scene.add.container(4, -48);
  const crest = scene.add.container(-4, -22);
  crest.add([
    plume(scene, 16, 4.2, -PI * 0.78, P.gold, undefined, 0.26).setPosition(-7, 3),
    plume(scene, 21, 5, -PI * 0.64, P.soft, P.peachLight, 0.26).setPosition(-1, -1),
    plume(scene, 17, 4.5, -PI * 0.50, P.gold, P.goldLight, 0.26).setPosition(5, -2),
    plume(scene, 12, 3.4, -PI * 0.40, P.goldPale, undefined, 0.26).setPosition(9, 0),
  ]);
  const headG = scene.add.graphics();
  headG.fillGradientStyle(P.soft, P.primary, P.primary, P.headEdge, 1).fillCircle(3, -11, 15.5);
  headG.fillStyle(P.soft, 0.7).fillEllipse(8, -6, 10, 7.2);
  headG.fillStyle(P.gold, 1).fillTriangle(15, -14, 32, -9, 15, -8.4);
  headG.fillStyle(P.beakDark, 1).fillTriangle(15, -8.4, 32, -9, 15, -5);
  const eye = scene.add.container(8, -13);
  eye.add([scene.add.circle(0, 0, 3.1, P.ink), scene.add.circle(1.2, -1.3, 1.1, P.white)]);
  head.add([crest, headG, eye]);
  bird.add(head);

  // ── Ближнее крыло: три маховых + три кроющих у плеча ──
  const wingFront = scene.add.container(-3, -40);
  wingFront.add([
    plume(scene, 31, 10, PI * 1.08, P.pressed, undefined, 0.34),
    plume(scene, 39, 12, PI * 1.18, P.primary, P.wingLight, 0.36),
    plume(scene, 32, 10, PI * 1.30, P.soft, P.peachLight, 0.32),
    plume(scene, 15, 6, PI * 1.06, P.deep, undefined, 0.3),
    plume(scene, 16, 6, PI * 1.18, P.deep, undefined, 0.3),
    plume(scene, 14, 6, PI * 1.30, P.deep, undefined, 0.3),
  ]);
  bird.add(wingFront);

  const moving = [bird, shadow, tail, wingBack, body, head, crest, eye, wingFront, ...tailPlumes, ...embers];

  // Твины двух слоёв: покой и текущее настроение. Меняя слой, старые останавливаем
  // и забываем — список не растёт, сколько бы раз ни переключали настроение.
  let idle: Phaser.Tweens.Tween[] = [];
  let moodLayer: Phaser.Tweens.Tween[] = [];
  let emberLayer: Phaser.Tweens.Tween[] = [];
  const stopAll = (list: Phaser.Tweens.Tween[]) => { for (const t of list) t.stop(); };

  const startEmbers = () => {
    stopAll(emberLayer);
    emberLayer = [];
    if (!full) return;
    embers.forEach((e, i) => {
      const baseY = e.y;
      e.setVisible(true).setAlpha(0);
      emberLayer.push(scene.tweens.add({
        targets: e, y: baseY - 22, alpha: { from: 0.9, to: 0 }, scale: { from: 0.5, to: 0 },
        duration: 2100, delay: i * 700, repeat: -1, ease: 'Quad.easeOut',
        onRepeat: () => { e.y = baseY; },
      }));
    });
  };
  const hideEmbers = () => {
    stopAll(emberLayer);
    emberLayer = [];
    embers.forEach((e) => e.setVisible(false));
  };

  /** Покой: семь движений с разными периодами — дыхание, хвост, хохолок, кивок, крыло, взгляд, моргание. */
  const startIdle = () => {
    stopAll(idle);
    idle = [];
    const add = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => { idle.push(scene.tweens.add(cfg)); };
    // Дыхание и моргание остаются даже при «уменьшить движение»: без них птица мёртвая.
    add({ targets: body, scaleY: 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add({ targets: shadow, scaleX: 1.05, alpha: 0.11, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add({ targets: eye, scaleY: 0.08, duration: 100, yoyo: true, repeat: -1, repeatDelay: 3200, ease: 'Sine.easeInOut' });
    if (!full) return;
    add({ targets: tail, rotation: { from: rad(-3), to: rad(3) }, duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Три средних пера хвоста качаются со сдвигом — хвост «течёт», а не машет доской.
    tailPlumes.slice(1, 4).forEach((p, i) => add({
      targets: p, rotation: { from: rad(-1.5), to: rad(2) }, duration: 1150, delay: 300 * i,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
    add({ targets: crest, rotation: { from: rad(3), to: rad(-4) }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add({ targets: head, y: head.y - 1.5, rotation: rad(2), duration: 1350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add({ targets: wingFront, rotation: rad(-3), duration: 1550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    add({ targets: eye, x: 8.9, duration: 500, hold: 1500, yoyo: true, repeat: -1, repeatDelay: 2000, ease: 'Sine.easeInOut' });
  };

  const resetPose = () => {
    bird.setPosition(0, 0).setScale(1).setRotation(0);
    for (const o of [tail, crest, head, wingFront, wingBack, ...tailPlumes]) o.setRotation(0);
    head.setPosition(4, -48);
    eye.setScale(1).setPosition(8, -13);
    body.setScale(1);
    shadow.setScale(1).setAlpha(0.14);
  };

  let mood: PhoenixMood = 'idle';
  let destroyed = false;

  const setMood = (next: PhoenixMood) => {
    if (destroyed) return;
    mood = next;
    stopAll(moodLayer);
    moodLayer = [];
    stopAll(idle);
    idle = [];
    resetPose();
    if (next === 'sad') hideEmbers(); else if (!emberLayer.length) startEmbers();

    // Без анимаций остаётся только поза «поник» — она несёт смысл, а не украшает.
    if (!full && next !== 'sad') { startIdle(); return; }

    const add = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => { moodLayer.push(scene.tweens.add(cfg)); };
    switch (next) {
      case 'idle':
        startIdle();
        break;
      case 'happy':
        add({
          targets: bird, y: -14, duration: 315, yoyo: true, ease: 'Back.easeOut',
          // Приземление с приседанием, потом снова покой.
          onComplete: () => {
            if (destroyed) return;
            add({ targets: bird, scaleX: 1.08, scaleY: 0.92, duration: 130, yoyo: true, onComplete: () => { if (!destroyed && mood === 'happy') startIdle(); } });
          },
        });
        add({ targets: shadow, scaleX: 0.7, alpha: 0.06, duration: 315, yoyo: true });
        add({ targets: wingFront, rotation: rad(-34), duration: 160, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
        add({ targets: wingBack, rotation: rad(22), duration: 160, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
        add({ targets: crest, rotation: rad(-4), duration: 225, yoyo: true, repeat: 1 });
        // «Улыбка» глаз: прищур снизу вверх.
        add({ targets: eye, scaleY: 0.55, y: -12, duration: 270, hold: 360, yoyo: true });
        break;
      case 'sad':
        add({ targets: bird, y: 5, duration: 420, ease: 'Quad.easeOut' });
        add({ targets: wingFront, rotation: rad(26), duration: 340, ease: 'Quad.easeOut' });
        add({ targets: crest, rotation: rad(16), duration: 340, ease: 'Quad.easeOut' });
        add({ targets: eye, scaleY: 0.45, duration: 340, ease: 'Quad.easeOut' });
        add({ targets: head, rotation: rad(7), y: -46, duration: 340, ease: 'Quad.easeOut' });
        // Грустная птица всё равно дышит — медленнее.
        add({ targets: body, scaleY: 1.02, duration: 1300, delay: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        break;
      case 'fly':
        add({ targets: bird, y: -9, rotation: { from: rad(-4), to: rad(-6) }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        add({ targets: shadow, scaleX: { from: 0.8, to: 0.7 }, alpha: { from: 0.06, to: 0.04 }, duration: 700, yoyo: true, repeat: -1 });
        add({ targets: wingFront, rotation: { from: rad(18), to: rad(-42) }, duration: 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        add({ targets: wingBack, rotation: { from: rad(-6), to: rad(30) }, duration: 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        add({ targets: tail, rotation: { from: rad(12), to: rad(20) }, duration: 250, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        add({ targets: crest, rotation: { from: rad(3), to: rad(-4) }, duration: 250, yoyo: true, repeat: -1 });
        add({ targets: eye, scaleY: 0.08, duration: 100, yoyo: true, repeat: -1, repeatDelay: 3200 });
        break;
      case 'curious':
        add({
          targets: head, rotation: rad(-10), x: 6, duration: 420, hold: 560, yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => { if (!destroyed && mood === 'curious') setMood('idle'); },
        });
        break;
    }
  };

  const blink = () => {
    if (destroyed) return;
    moodLayer.push(scene.tweens.add({ targets: eye, scaleY: 0.08, duration: 90, yoyo: true, ease: 'Quad.easeOut' }));
  };

  startIdle();
  startEmbers();

  return {
    root,
    setMood,
    celebrate: () => setMood('happy'),
    sink: () => setMood('sad'),
    blink,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopAll(idle);
      stopAll(moodLayer);
      stopAll(emberLayer);
      // Страховка на вложенные твины из onComplete: убиваем всё, что висит на частях.
      scene.tweens.killTweensOf(moving);
      root.destroy();
    },
    get mood() { return mood; },
  };
}
