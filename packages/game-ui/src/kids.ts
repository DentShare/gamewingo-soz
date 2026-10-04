import type { Scene } from 'phaser';
import { C, S, FONT, TYPE, WEIGHT, TOP_BAR_H } from './tokens.js';
import { DPR, LOGICAL_W, VIEW_TOP, VIEW_BOTTOM } from './viewport.js';
import { hideSplash, makeButton } from './widgets.js';
import { isMuted, playSound, setMuted } from './audio.js';
import { motionAllowed } from './motion.js';
import { makeStarRow } from './levels.js';
import { makePhoenix } from './phoenix.js';
import { uiText } from './strings.js';
import { getBackHandler, setBackHandler } from './pause.js';
import type { Block } from './chapters.js';

/**
 * Детский режим (T8 UX-волны, раздел 1g аудита): игрок 3–6 лет не читает.
 *
 * Было: то же меню, что у взрослых, — «Уровень 3 из 15», «Звук: вкл», замки,
 * очки и лидерборд с незнакомыми именами. Стало: дорожка из пяти крупных
 * кружков без замков, одна большая кнопка с треугольником, режим картинкой,
 * а выход, звук — у «Родителям», которое открывается только удержанием 2 с:
 * случайный тап не выбросит ребёнка в каталог банка.
 */

let kids = false;

/** Включить детский режим для игры: обучение без текста, правила-строки молчат. */
export function setKidsMode(on: boolean): void {
  kids = on;
}

export function isKidsMode(): boolean {
  return kids;
}

/* ── Шапка «Родителям» ─────────────────────────────────────────────────────── */

const HOLD_MS = 2000;

/** Иконка звука: динамик и две дуги (или крест, если звук выключен). */
function drawSpeaker(g: Phaser.GameObjects.Graphics, x: number, y: number, muted: boolean): void {
  g.clear();
  g.fillStyle(C.white, 1);
  g.fillRect(x - 11, y - 4, 6, 8);
  g.fillTriangle(x - 5, y - 4, x + 2, y - 10, x + 2, y + 10);
  g.fillTriangle(x - 5, y - 4, x + 2, y + 10, x - 5, y + 4);
  g.lineStyle(2.4, C.white, 1);
  if (muted) {
    g.lineBetween(x + 6, y - 5, x + 14, y + 5);
    g.lineBetween(x + 14, y - 5, x + 6, y + 5);
  } else {
    g.beginPath();
    g.arc(x + 3, y, 6, -0.9, 0.9);
    g.strokePath();
    g.beginPath();
    g.arc(x + 3, y, 11, -0.9, 0.9);
    g.strokePath();
  }
}

export interface KidsTopBarOpts {
  locale: string;
  /** Выход в каталог — только из меню родителей. */
  onExit(): void;
}

/**
 * Шапка детской игры: слева чип «Родителям» (держать 2 с — кольцо прогресса
 * на чипе), справа иконка звука. Названия нет — игру показывает её иконка
 * под шапкой, ребёнок всё равно не читает. Стрелки «назад» нет.
 */
export function makeKidsTopBar(scene: Scene, o: KidsTopBarOpts): Phaser.GameObjects.Container {
  hideSplash();
  const root = scene.add.container(0, 0).setDepth(40);
  const cy = TOP_BAR_H / 2;
  const bar = scene.add.graphics();
  bar
    .fillGradientStyle(C.topBarLeft, C.topBarRight, C.topBarLeft, C.topBarRight, 1)
    .fillRect(0, VIEW_TOP, LOGICAL_W, TOP_BAR_H - VIEW_TOP);


  // Чип «Родителям»: белая полупрозрачная пилюля, слева кольцо прогресса удержания.
  const label = scene.add
    .text(0, 0, uiText(o.locale, 'kids.parents'), { fontFamily: FONT, fontSize: TYPE.caption, fontStyle: WEIGHT.bold, color: S.white })
    .setOrigin(0, 0.5)
    .setResolution(DPR);
  const chipW = 16 + 16 + 6 + label.width + 12;
  const chipX = 12;
  const chip = scene.add.graphics();
  chip.fillStyle(C.white, 0.22).fillRoundedRect(chipX, cy - 15, chipW, 30, 15);
  label.setPosition(chipX + 16 + 16 + 6, cy);
  const ringX = chipX + 16 + 8;
  const ring = scene.add.graphics();
  const drawRing = (p: number) => {
    ring.clear();
    ring.lineStyle(2.4, C.white, 0.45).strokeCircle(ringX, cy, 8);
    if (p > 0) {
      ring.lineStyle(2.4, C.white, 1).beginPath();
      ring.arc(ringX, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p));
      ring.strokePath();
    }
  };
  drawRing(0);
  const chipHit = scene.add.rectangle(chipX + chipW / 2, cy, chipW + 8, 44, 0x000000, 0).setInteractive({ useHandCursor: true });
  let hold: Phaser.Tweens.Tween | null = null;
  const progress = { p: 0 };
  const cancel = () => {
    hold?.remove();
    hold = null;
    progress.p = 0;
    drawRing(0);
  };
  chipHit.on('pointerdown', () => {
    cancel();
    hold = scene.tweens.add({
      targets: progress, p: 1, duration: HOLD_MS, ease: 'Linear',
      onUpdate: () => drawRing(progress.p),
      onComplete: () => {
        hold = null;
        drawRing(0);
        progress.p = 0;
        playSound('tap');
        openParentsSheet(scene, o);
      },
    });
  });
  chipHit.on('pointerup', cancel);
  chipHit.on('pointerout', cancel);

  // Звук справа: одна иконка, тап переключает.
  const spX = LOGICAL_W - 34;
  const speaker = scene.add.graphics();
  drawSpeaker(speaker, spX, cy, isMuted());
  const spHit = scene.add.rectangle(spX + 2, cy, 44, 44, 0x000000, 0).setInteractive({ useHandCursor: true });
  spHit.on('pointerup', () => {
    setMuted(!isMuted());
    drawSpeaker(speaker, spX, cy, isMuted());
    if (!isMuted()) playSound('tap');
  });

  root.add([bar, chip, ring, label, chipHit, speaker, spHit]);
  scene.events.once('shutdown', cancel);
  return root;
}

/** Меню родителей: выйти в каталог, звук, закрыть. Язык выбирается в каталоге. */
function openParentsSheet(scene: Scene, o: KidsTopBarOpts): void {
  const root = scene.add.container(0, 0).setDepth(1000);
  // Системный «назад» при открытом меню родителей закрывает его, а не игру.
  const prevBack = getBackHandler();
  const close = () => {
    if (!root.active) return;
    root.destroy();
    setBackHandler(prevBack);
  };
  setBackHandler(close);
  const dim = scene.add
    .rectangle(LOGICAL_W / 2, (VIEW_TOP + VIEW_BOTTOM) / 2, LOGICAL_W, VIEW_BOTTOM - VIEW_TOP, C.ink, 0.5)
    .setInteractive();
  // Закрывает только тап, начатый на затемнении: палец, державший «Родителям»,
  // отпускается уже над затемнением — меню не должно тут же закрыться.
  let downOnDim = false;
  dim.on('pointerdown', () => { downOnDim = true; });
  dim.on('pointerup', () => { if (downOnDim) close(); downOnDim = false; });
  const H = 20 + 26 + 22 + 18 + 48 + 12 + 44 + 12 + 44 + 28;
  const top = VIEW_BOTTOM - H;
  const sheet = scene.add.graphics();
  sheet.fillStyle(C.bg, 1).fillRoundedRect(0, top, LOGICAL_W, H + 20, { tl: 20, tr: 20, bl: 0, br: 0 });
  const sheetHit = scene.add.rectangle(LOGICAL_W / 2, top + H / 2, LOGICAL_W, H, 0x000000, 0).setInteractive();
  const title = scene.add
    .text(LOGICAL_W / 2, top + 33, uiText(o.locale, 'kids.parents'), { fontFamily: FONT, fontSize: TYPE.title, fontStyle: WEIGHT.bold, color: S.ink })
    .setOrigin(0.5)
    .setResolution(DPR);
  const sub = scene.add
    .text(LOGICAL_W / 2, top + 58, uiText(o.locale, 'kids.parentsHint'), { fontFamily: FONT, fontSize: 13, color: S.muted })
    .setOrigin(0.5)
    .setResolution(DPR);
  const bw = LOGICAL_W - 40;
  let y = top + 20 + 26 + 22 + 18;
  const backBtn = makeButton(scene, LOGICAL_W / 2, y + 24, uiText(o.locale, 'kids.back'), () => close(), {
    primary: true, width: bw, height: 48,
  });
  y += 48 + 12;
  const soundLabel = () => uiText(o.locale, isMuted() ? 'kids.soundOn' : 'kids.soundOff');
  const sound = makeButton(scene, LOGICAL_W / 2, y + 22, soundLabel(), () => {
    setMuted(!isMuted());
    close();
    scene.scene.restart();
  }, { width: bw, height: 44 });
  y += 44 + 12;
  const exit = makeButton(scene, LOGICAL_W / 2, y + 22, uiText(o.locale, 'kids.exit'), () => {
    close();
    o.onExit();
  }, { width: bw, height: 44, danger: true });
  root.add([dim, sheet, sheetHit, title, sub, backBtn.root, sound.root, exit.root]);
  scene.events.once('shutdown', () => { if (root.active) root.destroy(); });
}

/* ── Дорожка уровней ──────────────────────────────────────────────────────── */

export interface KidsStop {
  n: number;
  /** Заработанные звёзды: 0 — ещё не пройден. */
  stars: number;
  state: 'done' | 'current' | 'future';
}

const DONE = 56;
const CURRENT = 72;

/** Пять кружков одной главы: пройденные со звёздами, текущий пульсирует, будущие — контуром. */
function makeKidsPath(scene: Scene, cx: number, cy: number, stops: readonly KidsStop[], onPick: (n: number) => void) {
  const root = scene.add.container(cx, cy);
  // Шаг — чтобы текущий (72) и соседний (56) не касались и крайний не жался
  // к краю экрана: 72 × 4 + 72 = 360 из 400, по 20 с каждой стороны.
  const step = 72;
  const x0 = -(step * (stops.length - 1)) / 2;
  const line = scene.add.graphics();
  line.lineStyle(4, C.divider, 1).lineBetween(x0, 0, x0 + step * (stops.length - 1), 0);
  root.add(line);
  stops.forEach((s, i) => {
    const x = x0 + step * i;
    const dot = scene.add.container(x, 0);
    const g = scene.add.graphics();
    if (s.state === 'current') {
      g.fillStyle(C.primaryPressed, 1).fillCircle(0, 4, CURRENT / 2);
      g.fillStyle(C.primary, 1).fillCircle(0, 0, CURRENT / 2);
      g.fillStyle(C.white, 1).fillTriangle(-8, -12, -8, 12, 13, 0);
    } else if (s.state === 'done') {
      g.fillStyle(C.success, 1).fillCircle(0, 0, DONE / 2);
      g.lineStyle(4, C.white, 1).beginPath();
      g.moveTo(-10, 1); g.lineTo(-3, 8); g.lineTo(11, -7);
      g.strokePath();
    } else {
      g.fillStyle(C.surface, 1).fillCircle(0, 0, DONE / 2);
      g.lineStyle(3, C.divider, 1).strokeCircle(0, 0, DONE / 2);
    }
    dot.add(g);
    if (s.state === 'done') dot.add(makeStarRow(scene, 0, DONE / 2 + 14, s.stars, 7));
    const r = s.state === 'current' ? CURRENT / 2 : DONE / 2;
    const hit = scene.add.circle(0, 0, r + 8, 0x000000, 0).setInteractive({ useHandCursor: true });
    // Тап, а не свайп: палец опустился на этот же кружок и почти не сдвинулся.
    // Иначе свайп, закончившийся на кружке, запускал бы уровень.
    let downAt: { x: number; y: number } | null = null;
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => { downAt = { x: p.worldX, y: p.worldY }; });
    hit.on('pointerout', () => { downAt = null; });
    hit.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = downAt;
      downAt = null;
      if (!d || Math.hypot(p.worldX - d.x, p.worldY - d.y) > 14) return;
      if (s.state === 'future') {
        // Будущий — не «сломанная» кнопка, а лёгкое покачивание: «ещё не сейчас».
        if (motionAllowed()) scene.tweens.add({ targets: dot, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => dot.setAngle(0) });
        return;
      }
      playSound('tap');
      onPick(s.n);
    });
    dot.add(hit);
    if (s.state === 'current' && motionAllowed()) {
      scene.tweens.add({ targets: dot, scale: 1.08, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    root.add(dot);
  });
  return root;
}

export interface KidsPathPagerOpts {
  /** Главы: по пять остановок. */
  chapters: ReadonlyArray<readonly KidsStop[]>;
  /** С какой главы начать (с нуля) — обычно та, где текущий. */
  initial: number;
  onPick(n: number): void;
}

/**
 * Три дорожки = три главы: видна одна, соседние — свайпом; точки под ней.
 * Высота блока постоянная — под ней можно ставить кнопку.
 */
export function makeKidsPathPager(scene: Scene, cx: number, top: number, o: KidsPathPagerOpts): Block {
  const root = scene.add.container(0, 0);
  const pathY = top + CURRENT / 2 + 8;
  let page = Math.max(0, Math.min(o.chapters.length - 1, o.initial));
  let current = makeKidsPath(scene, cx, pathY, o.chapters[page], o.onPick);
  root.add(current);

  const dotsY = pathY + CURRENT / 2 + 34;
  const dots = scene.add.graphics();
  const drawDots = () => {
    dots.clear();
    const n = o.chapters.length;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 20;
      dots.fillStyle(i === page ? C.primary : C.divider, 1).fillCircle(x, dotsY, i === page ? 5 : 4);
    }
  };
  drawDots();
  root.add(dots);

  const go = (dir: number) => {
    const next = page + dir;
    if (next < 0 || next >= o.chapters.length) return;
    page = next;
    const old = current;
    current = makeKidsPath(scene, cx + dir * LOGICAL_W, pathY, o.chapters[page], o.onPick);
    root.add(current);
    if (motionAllowed()) {
      scene.tweens.add({ targets: old, x: cx - dir * LOGICAL_W, duration: 260, ease: 'Cubic.easeOut', onComplete: () => old.destroy() });
      scene.tweens.add({ targets: current, x: cx, duration: 260, ease: 'Cubic.easeOut' });
    } else {
      old.destroy();
      current.setX(cx);
    }
    drawDots();
  };

  // Свайп по полосе дорожки: влево — следующая глава, вправо — предыдущая.
  // Слушаем всю сцену, а не прямоугольник под кружками: свайп, начатый на
  // кружке, тоже листает (кружки почти касаются, между ними не попасть).
  const band = CURRENT / 2 + 30;
  let downX: number | null = null;
  const onDown = (p: Phaser.Input.Pointer) => {
    downX = Math.abs(p.worldY - pathY) <= band ? p.worldX : null;
  };
  const onUp = (p: Phaser.Input.Pointer) => {
    if (downX === null) return;
    const dx = p.worldX - downX;
    downX = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };
  scene.input.on('pointerdown', onDown);
  scene.input.on('pointerup', onUp);
  scene.events.once('shutdown', () => {
    scene.input.off('pointerdown', onDown);
    scene.input.off('pointerup', onUp);
  });
  return { root, height: dotsY + 8 - top };
}

/* ── Большая кнопка «играть» ──────────────────────────────────────────────── */

/** Круг 88 с белым треугольником, тень primaryPressed 6 px, пульс 1,8 с. */
export function makeKidsPlayButton(
  scene: Scene,
  x: number,
  y: number,
  onPlay: () => void,
  icon: 'play' | 'next' | 'retry' = 'play',
): Phaser.GameObjects.Container {
  const R = 44;
  const root = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(C.primaryPressed, 1).fillCircle(0, 6, R);
  g.fillStyle(C.primary, 1).fillCircle(0, 0, R);
  g.fillStyle(C.white, 1);
  if (icon === 'play') {
    g.fillTriangle(-12, -18, -12, 18, 20, 0);
  } else if (icon === 'retry') {
    // «Ещё раз»: круговая стрелка.
    g.lineStyle(7, C.white, 1).beginPath();
    g.arc(0, 0, 17, -Math.PI * 0.35, Math.PI * 1.35);
    g.strokePath();
    const a = -Math.PI * 0.35;
    const tx = Math.cos(a) * 17, ty = Math.sin(a) * 17;
    g.fillTriangle(tx - 9, ty - 4, tx + 9, ty - 4, tx, ty + 9);
  } else {
    // «Дальше»: стрелка.
    g.fillRect(-18, -5, 22, 10);
    g.fillTriangle(2, -16, 2, 16, 20, 0);
  }
  const hit = scene.add.circle(0, 0, R + 6, 0x000000, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => { playSound('tap'); root.setScale(0.94); });
  hit.on('pointerout', () => root.setScale(1));
  hit.on('pointerup', () => { root.setScale(1); onPlay(); });
  root.add([g, hit]);
  if (motionAllowed()) {
    scene.tweens.add({ targets: g, scale: 1.06, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return root;
}

/* ── Итог ─────────────────────────────────────────────────────────────────── */

/**
 * Итог детского уровня: три звезды крупно, феникс радуется, одна кнопка
 * «дальше». Проиграть нельзя, очков и лидерборда нет.
 */
export function makeKidsResult(
  scene: Scene,
  o: {
    stars: number;
    onNext(): void;
    top?: number;
    /** Провал (судоку с лимитами): феникс грустит, «дальше» переигрывает. По умолчанию — радость. */
    mood?: 'happy' | 'sad';
  },
): void {
  const cx = LOGICAL_W / 2;
  const top = o.top ?? TOP_BAR_H + 40;
  const phoenix = makePhoenix(scene, cx, top + 150, 150);
  scene.time.delayedCall(300, () => (o.mood === 'sad' ? phoenix.sink() : phoenix.celebrate()));
  scene.events.once('shutdown', () => phoenix.destroy());

  const stars = makeStarRow(scene, cx, top + 290, o.stars, 34);
  if (motionAllowed()) {
    stars.setScale(0);
    scene.tweens.add({ targets: stars, scale: 1, duration: 420, delay: 380, ease: 'Back.easeOut' });
  }
  for (let i = 0; i < o.stars; i++) scene.time.delayedCall(420 + i * 170, () => playSound('star'));
  makeKidsPlayButton(scene, cx, top + 420, o.onNext, o.mood === 'sad' ? 'retry' : 'next');
}
