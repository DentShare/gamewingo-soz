import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT, TOP_BAR_H } from './tokens.js';
import { DPR, LOGICAL_W, VIEW_BOTTOM } from './viewport.js';
import { makeButton } from './widgets.js';
import { motionAllowed } from './motion.js';
import { uiText } from './strings.js';

/**
 * Онбординг в один шаг (T6 UX-волны, раздел 1b аудита): учить действием, а не
 * карточками.
 *
 * Было: затемнение, четыре карточки и «Далее» — 20–30 секунд без игры, а в
 * детских играх это чтение делает родитель. Стало: поле видно, нужные элементы
 * обведены и пульсируют, остальное приглушено, внизу тёмная полоса с одной
 * фразой и кнопкой «Пропустить». Тап по подсвеченному — настоящий ход; обучение
 * заканчивается, когда игра скажет `done()` после первого удачного хода.
 * Правила про промах и лимит — не заранее, а в момент события (`showRuleOnce`).
 */

export interface Rect { x: number; y: number; w: number; h: number }

export interface FirstMoveTutorialOpts {
  locale: string;
  /** Фраза-подсказка из словаря игры (`tutorial.firstMove`): «Открой две подсвеченные карточки — это пара». */
  text: string;
  /** Что подсветить; зовётся заново на `refresh()` (поле могло сдвинуться). */
  targets(): Rect[];
  /** Строка над полосой: «Таймер и ходы включатся после первой пары». */
  note?: string;
  /** Отступ рамки вокруг цели. */
  pad?: number;
  /** Скругление рамки. */
  radius?: number;
  /** Круглая цель (мишень): вырез и рамка — круг, вписанный в прямоугольник цели. */
  shape?: 'rect' | 'circle';
  /** Насколько приглушать остальное (0…1). Аркадам в движении — мягче, например 0.4. */
  veilAlpha?: number;
  /** Обучение закончено — ходом (`done`) или «Пропустить». */
  onDone(skipped: boolean): void;
}

export interface FirstMoveTutorial {
  /** Первый удачный ход сделан — убрать подсказку и включить игру. */
  done(): void;
  /** Цели изменились (открылась одна карточка из двух) — перерисовать подсветку. */
  refresh(): void;
  readonly active: boolean;
  /** Верх полосы-подсказки — чтобы игра могла приподнять поле над ней. */
  readonly barTop: number;
}

/** Глубина слоя: над полем, под паузой (1000) и тостами правил. */
const DEPTH = 900;

/**
 * Приглушение всего, кроме целей: прямоугольники-«ячейки» между краями целей.
 * Сетка по x/y-краям целей даёт ровное покрытие без масок и render-texture.
 */
function drawVeil(g: Phaser.GameObjects.Graphics, holes: Rect[], top: number, bottom: number, alpha: number, circle: boolean): void {
  const xs = [0, LOGICAL_W, ...holes.flatMap((h) => [h.x, h.x + h.w])].sort((a, b) => a - b);
  const ys = [top, bottom, ...holes.flatMap((h) => [h.y, h.y + h.h])].sort((a, b) => a - b);
  const inHole = (x: number, y: number) => holes.some((h) => x > h.x && x < h.x + h.w && y > h.y && y < h.y + h.h);
  g.fillStyle(C.bg, alpha);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = Math.max(0, xs[i]), x1 = Math.min(LOGICAL_W, xs[i + 1]);
      const y0 = Math.max(top, ys[j]), y1 = Math.min(bottom, ys[j + 1]);
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue;
      if (inHole((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  // Круглая цель: углы квадрата вокруг круга тоже приглушаем — вырез остаётся круглым.
  if (circle) {
    for (const h of holes) {
      const cx = h.x + h.w / 2, cy = h.y + h.h / 2, r = Math.min(h.w, h.h) / 2;
      const corners: Array<[number, number, number]> = [
        [h.x, h.y, Math.PI], [h.x + h.w, h.y, Math.PI * 1.5], [h.x + h.w, h.y + h.h, 0], [h.x, h.y + h.h, Math.PI / 2],
      ];
      for (const [qx, qy, a0] of corners) {
        const pts: Phaser.Types.Math.Vector2Like[] = [{ x: qx, y: qy }];
        for (let k = 0; k <= 8; k++) {
          const a = a0 + (Math.PI / 2) * (k / 8);
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        g.fillPoints(pts as Phaser.Math.Vector2[], true);
      }
    }
  }
}

/**
 * Один шаг обучения поверх живой партии. Ввод не блокируется: приглушение не
 * ловит тапы, игрок делает настоящий ход. Шапка (стрелка, пауза) остаётся доступной.
 */
export function runFirstMoveTutorial(scene: Scene, o: FirstMoveTutorialOpts): FirstMoveTutorial {
  const root = scene.add.container(0, 0).setDepth(DEPTH);
  const veil = scene.add.graphics();
  const rings = scene.add.graphics();
  root.add([veil, rings]);
  let active = true;

  // Полоса-тост внизу: не закрывает то, о чём говорит.
  const barW = LOGICAL_W - 32;
  const btnW = 112;
  const textW = barW - 16 - btnW - 12 - 16;
  const msg = scene.add
    .text(0, 0, o.text, { fontFamily: FONT, fontSize: TYPE.body, color: S.white, lineSpacing: 2 })
    .setWordWrapWidth(textW, true)
    .setResolution(DPR);
  const barH = Math.max(64, msg.height + 28);
  const barTop = VIEW_BOTTOM - 16 - barH - 8;
  const bar = scene.add.graphics();
  bar.fillStyle(C.ink, 0.94).fillRoundedRect(16, barTop, barW, barH, RADIUS.card);
  msg.setPosition(32, barTop + (barH - msg.height) / 2);
  const skip = makeButton(scene, 16 + barW - 12 - btnW / 2, barTop + barH / 2, uiText(o.locale, 'tutorial.skip'), () => finish(true), {
    width: btnW, height: 40,
  });
  // Полоса ловит тапы: мимо кнопки — ничего, а не ход под ней.
  const barHit = scene.add.rectangle(16 + barW / 2, barTop + barH / 2, barW, barH, 0x000000, 0).setInteractive();
  root.add([bar, barHit, msg, skip.root]);
  skip.root.setDepth(1);

  let note: Phaser.GameObjects.Text | null = null;
  if (o.note) {
    note = scene.add
      .text(LOGICAL_W / 2, barTop - 10, o.note, { fontFamily: FONT, fontSize: TYPE.caption, fontStyle: WEIGHT.semibold, color: S.muted })
      .setOrigin(0.5, 1)
      .setResolution(DPR);
    root.add(note);
  }

  const pad = o.pad ?? 6;
  const radius = o.radius ?? 14;
  const draw = () => {
    const holes = o.targets().map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }));
    veil.clear();
    const circle = o.shape === 'circle';
    drawVeil(veil, holes, TOP_BAR_H, VIEW_BOTTOM, o.veilAlpha ?? 0.65, circle);
    rings.clear();
    rings.lineStyle(3, C.primary, 1);
    for (const h of holes) {
      if (circle) rings.strokeCircle(h.x + h.w / 2, h.y + h.h / 2, Math.min(h.w, h.h) / 2);
      else rings.strokeRoundedRect(h.x, h.y, h.w, h.h, radius);
    }
  };
  draw();

  // Пульс рамки 1,4 с — глаз находит цель без стрелок и текста.
  const pulse = motionAllowed()
    ? scene.tweens.add({ targets: rings, alpha: 0.35, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    : null;

  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 200 });

  function finish(skipped: boolean) {
    if (!active) return;
    active = false;
    pulse?.remove();
    scene.tweens.add({ targets: root, alpha: 0, duration: 180, onComplete: () => root.destroy() });
    o.onDone(skipped);
  }
  scene.events.once('shutdown', () => {
    active = false;
    root.destroy();
  });

  return {
    done: () => finish(false),
    refresh: () => { if (active) draw(); },
    get active() { return active; },
    barTop: note ? barTop - 28 : barTop,
  };
}

const RULE_KEY = 'wingo:rules';

function seenRules(): string[] {
  try {
    const raw = localStorage.getItem(RULE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Правило — в момент события и один раз: первый промах, первый лимит.
 * Тёмная строка-тост под шапкой на 2 с: внизу живёт полоса обучения и кнопки
 * игры, а верх поля в момент события свободен. `id` — «<игра>:<правило>».
 * Возвращает true, если показано (ещё не видели).
 */
export function showRuleOnce(scene: Scene, id: string, text: string): boolean {
  const seen = seenRules();
  if (seen.includes(id)) return false;
  try {
    localStorage.setItem(RULE_KEY, JSON.stringify([...seen, id]));
  } catch {
    /* без хранилища покажем ещё раз — не страшно */
  }
  const root = scene.add.container(LOGICAL_W / 2, 0).setDepth(950);
  const txt = scene.add
    .text(0, 0, text, { fontFamily: FONT, fontSize: TYPE.body, color: S.white, align: 'center' })
    .setOrigin(0.5)
    .setWordWrapWidth(LOGICAL_W - 72, true)
    .setResolution(DPR);
  const w = Math.min(LOGICAL_W - 32, txt.width + 32);
  const h = Math.max(44, txt.height + 20);
  const g = scene.add.graphics();
  g.fillStyle(C.ink, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, RADIUS.card);
  root.add([g, txt]);
  root.setY(TOP_BAR_H + 12 + h / 2);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
  scene.tweens.add({ targets: root, alpha: 0, delay: 2000, duration: 300, onComplete: () => root.destroy() });
  return true;
}
