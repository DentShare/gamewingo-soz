import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT, BUTTON_H } from './tokens.js';
import { DPR, LOGICAL_H, LOGICAL_W } from './viewport.js';
import { makeButton, makeChip } from './widgets.js';
import { makeStarRow } from './levels.js';
import { drawCoin } from './bonus.js';
import { motionAllowed } from './motion.js';
import { playSound } from './audio.js';
import { makePhoenix } from './phoenix.js';
import { uiText, uiPlural } from './strings.js';
import type { Block } from './chapters.js';

/**
 * Экран итогов (T4 UX-волны, разделы 1d и 1f аудита): одна валюта и одна
 * причина сыграть ещё.
 *
 * Лестницы: «Уровень 3 · Глава 1» → заголовок → звёзды → «почти» (до третьей
 * звезды — 1 ход, рядом «Ещё раз») → расшифровка бонусов → «Уровень 4 · новое:
 * 6 пар» → «В меню». Очков и лидерборда больше нет: звёзды считаются по ходам,
 * а топ-5 по отдельному уровню головоломки ничего не значит.
 *
 * Аркады: главная цифра забега вместо «Забег окончен», чипы «960 очков · рекорд
 * 20», карточка «Почти! Испытание 4 — не хватило 3», «Следом» — два следующих.
 *
 * Виджеты не знают правил: что начислено и что «почти» — считает
 * `@gamewingo/game-progress` (`settleLadderRound`, `settleArcadeRound`).
 */

const CARD_W = 360;
const PAD = 16;
const GAP = 16;
/** Кнопки прижаты к низу вёрстки 720, если колонка короче: большой палец дотягивается. */
const ACTIONS_Y = LOGICAL_H - 150;


const text = (
  scene: Scene, x: number, y: number, s: string,
  size: number, color: string, weight: string = WEIGHT.regular,
) => scene.add
  .text(x, y, s, { fontFamily: FONT, fontSize: size, fontStyle: weight, color })
  .setResolution(DPR);

function card(scene: Scene, w: number, h: number, border?: { color: number; width: number }): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(C.surface, 1).fillRoundedRect(0, 0, w, h, RADIUS.card);
  if (border) g.lineStyle(border.width, border.color, 1).strokeRoundedRect(0, 0, w, h, RADIUS.card);
  else g.lineStyle(1, C.divider, 0.6).strokeRoundedRect(0, 0, w, h, RADIUS.card);
  return g;
}

function bar(scene: Scene, x: number, y: number, w: number, h: number, ratio: number, color: number) {
  const g = scene.add.graphics();
  g.fillStyle(C.slot, 1).fillRoundedRect(x, y, w, h, h / 2);
  const r = Math.max(0, Math.min(1, ratio));
  if (r > 0) g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(h, w * r), h, h / 2);
  return g;
}

/** Укоротить строку с многоточием под ширину. */
function fit(t: Phaser.GameObjects.Text, maxW: number): Phaser.GameObjects.Text {
  if (t.width <= maxW) return t;
  let s = t.text;
  while (s.length > 1 && t.width > maxW) {
    s = s.slice(0, -1);
    t.setText(`${s.trimEnd()}…`);
  }
  return t;
}

/* ── «Почти» лестницы ──────────────────────────────────────────────────────── */

export interface AlmostCardOpts {
  /** «До третьей звезды — 1 ход». */
  title: string;
  /** «Вы: 9 ходов · нужно 8 · время 0:42». */
  detail?: string;
  againLabel: string;
  onAgain(): void;
}

/** Карточка «почти»: дельта до третьей звезды и «Ещё раз» прямо рядом с ней. */
export function makeAlmostCard(scene: Scene, x: number, y: number, o: AlmostCardOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  const btnW = 96;
  const textW = CARD_W - PAD * 2 - btnW - 12;
  const title = text(scene, PAD, PAD, o.title, TYPE.body, S.ink, WEIGHT.semibold).setWordWrapWidth(textW, true);
  let h = PAD + title.height;
  const items: Phaser.GameObjects.GameObject[] = [title];
  if (o.detail) {
    const d = text(scene, PAD, h + 4, o.detail, TYPE.caption, S.muted).setWordWrapWidth(textW, true);
    items.push(d);
    h += 4 + d.height;
  }
  h = Math.max(h + PAD, 68);
  const btn = makeButton(scene, CARD_W - PAD - btnW / 2, h / 2, o.againLabel, () => o.onAgain(), { width: btnW, height: 36 });
  root.add([card(scene, CARD_W, h), ...items, btn.root]);
  return { root, height: h };
}

/* ── Расшифровка бонусов ──────────────────────────────────────────────────── */

/** Строка разбивки — структурно та же, что `BonusLine` из game-progress. */
export interface BonusLineView {
  kind: string;
  n?: number;
  amount: number;
  granted: boolean;
  mission?: { kind: string; progress: number; target: number };
}

/** Подпись строки разбивки на языке игрока. */
export function bonusLineLabel(locale: string, line: BonusLineView): string {
  if (line.kind === 'mission' && line.mission) {
    const m = line.mission;
    const what = uiPlural(locale, `mission.${m.kind}`, m.target, { n: m.target });
    return uiText(locale, 'bonus.mission', { text: what });
  }
  const key = `bonus.${line.kind}`;
  const label = uiText(locale, key, { n: line.n ?? '' });
  return label === key ? uiText(locale, 'bonus.other') : label;
}

export interface BonusBreakdownOpts {
  locale: string;
  lines: readonly BonusLineView[];
  /** Начислено этой партией. */
  total: number;
}

export interface BonusBreakdown extends Block {
  /** Точка строки «Начислено» в мировых координатах — оттуда вылетает «+N». */
  totalAt: { x: number; y: number };
}

/**
 * Карточка бонусов: «Первое прохождение уровня 3 +24», «Задание дня: пройти 3
 * уровня 2/3 +15» (приглушённо, если не закрыто), разделитель и «Начислено +24»
 * с монетой. Нечего показать — пустой блок высотой 0.
 */
export function makeBonusBreakdown(scene: Scene, x: number, y: number, o: BonusBreakdownOpts): BonusBreakdown {
  const root = scene.add.container(x - CARD_W / 2, y);
  if (!o.lines.length && o.total <= 0) return { root, height: 0, totalAt: { x, y } };


  const ROW = 26;
  const items: Phaser.GameObjects.GameObject[] = [];
  let cy = PAD;
  // Незакрытых заданий — одно, самое близкое к цели: карточка учит правилу,
  // а не перечисляет весь список дня (он в хабе, на экране «Бонусы»).
  const pending = o.lines
    .filter((l) => !l.granted && l.mission)
    .sort((a, b) => b.mission!.progress / b.mission!.target - a.mission!.progress / a.mission!.target)[0];
  const shown = o.lines.filter((l) => l.granted || l === pending);
  for (const line of shown) {
    const color = line.granted ? S.ink : S.muted;
    const amount = text(scene, CARD_W - PAD, cy, `+${line.amount}`, TYPE.body, line.granted ? S.gold : S.muted, WEIGHT.semibold)
      .setOrigin(1, 0);
    let right = CARD_W - PAD - amount.width - 10;
    if (line.mission && !line.granted) {
      const prog = text(scene, right, cy + 1, `${line.mission.progress}/${line.mission.target}`, TYPE.caption + 1, S.muted, WEIGHT.semibold)
        .setOrigin(1, 0);
      items.push(prog);
      right -= prog.width + 10;
    }
    // Длинная подпись («Задание дня: набрать 5000 очков») переносится, а не режется.
    const label = text(scene, PAD, cy, bonusLineLabel(o.locale, line), TYPE.body - 1, color)
      .setWordWrapWidth(right - PAD, true);
    items.push(label, amount);
    cy += Math.max(ROW, label.height + 8);
  }

  let totalY = cy;
  if (o.total > 0) {
    if (shown.length) {
      const div = scene.add.graphics();
      div.lineStyle(1, C.divider, 1).lineBetween(PAD, cy + 4, CARD_W - PAD, cy + 4);
      items.push(div);
      cy += 14;
    }
    totalY = cy + 11;
    items.push(text(scene, PAD, cy, uiText(o.locale, 'bonus.total'), TYPE.body, S.ink, WEIGHT.semibold));
    const sum = text(scene, CARD_W - PAD, cy - 1, `+${o.total}`, TYPE.headline, S.gold, WEIGHT.bold).setOrigin(1, 0);
    const coin = scene.add.graphics();
    drawCoin(coin, CARD_W - PAD - sum.width - 14, cy + 10, 8);
    items.push(coin, sum);
    cy += ROW;
  }
  const h = cy + PAD - 6;
  root.add([card(scene, CARD_W, h), ...items]);
  return { root, height: h, totalAt: { x, y: y + totalY } };
}

/* ── Аркады: испытание и «следом» ─────────────────────────────────────────── */

export interface ChallengeCardOpts {
  /** almost — «Почти!», рамка primary; done — испытание закрыто. */
  state: 'almost' | 'done';
  /** «Почти! Испытание 4». */
  title: string;
  /** Чип «+26». */
  reward?: string;
  /** «Съешь 12 яблок за забег». */
  text: string;
  value?: number;
  target?: number;
  /** «В этом забеге: 9 · не хватило 3». */
  detail?: string;
}

export function makeChallengeCard(scene: Scene, x: number, y: number, o: ChallengeCardOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  const almost = o.state === 'almost';
  const items: Phaser.GameObjects.GameObject[] = [];
  const title = text(scene, PAD, PAD, o.title, TYPE.caption, almost ? S.primary : S.success, WEIGHT.bold);
  items.push(title);
  if (o.reward) {
    const chip = makeChip(scene, 0, 0, o.reward, 0, almost ? 'default' : 'success');
    chip.root.setPosition(CARD_W - PAD - chip.width / 2, PAD + 8);
    items.push(chip.root);
  }
  let cy = PAD + 22;
  const body = text(scene, PAD, cy, o.text, TYPE.body, S.ink, WEIGHT.semibold).setWordWrapWidth(CARD_W - PAD * 2, true);
  items.push(body);
  cy += body.height + 10;
  if (o.value !== undefined && o.target) {
    items.push(bar(scene, PAD, cy, CARD_W - PAD * 2, 8, o.value / o.target, almost ? C.primary : C.success));
    cy += 8 + 8;
  }
  if (o.detail) {
    items.push(text(scene, PAD, cy, o.detail, TYPE.caption, S.muted));
    cy += 18;
  }
  const h = cy + PAD - 4;
  root.add([card(scene, CARD_W, h, { color: almost ? C.primary : C.success, width: 2 }), ...items]);
  return { root, height: h };
}

export interface FollowingOpts {
  /** «Следом». */
  header: string;
  /** «до +29». */
  hint?: string;
  rows: ReadonlyArray<{ text: string; value: number; target: number }>;
}

/** «Следом»: два следующих испытания с прогрессом «2 / 3» и тонкой полосой. */
export function makeFollowingList(scene: Scene, x: number, y: number, o: FollowingOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  if (!o.rows.length) return { root, height: 0 };
  const items: Phaser.GameObjects.GameObject[] = [
    text(scene, 4, 0, o.header, TYPE.caption, S.muted, WEIGHT.semibold),
  ];
  if (o.hint) items.push(text(scene, CARD_W - 4, 0, o.hint, TYPE.caption, S.gold, WEIGHT.semibold).setOrigin(1, 0));
  let cy = 22;
  const ROW_H = 48;
  for (const r of o.rows) {
    const row = scene.add.container(0, cy);
    const g = scene.add.graphics();
    g.fillStyle(C.surface, 1).fillRoundedRect(0, 0, CARD_W, ROW_H, RADIUS.card);
    g.lineStyle(1, C.divider, 0.6).strokeRoundedRect(0, 0, CARD_W, ROW_H, RADIUS.card);
    const count = text(scene, CARD_W - 14, 12, `${Math.min(r.value, r.target)} / ${r.target}`, TYPE.caption + 1, S.muted, WEIGHT.semibold)
      .setOrigin(1, 0);
    const label = fit(text(scene, 14, 11, r.text, TYPE.body - 1, S.ink), CARD_W - 14 - count.width - 24);
    row.add([g, label, count, bar(scene, 14, 35, CARD_W - 28, 4, r.value / r.target, C.primarySoft)]);
    items.push(row);
    cy += ROW_H + 8;
  }
  root.add(items);
  return { root, height: cy - 8 };
}

/** Чипы под заголовком аркады: «960 очков», «рекорд 20». */
export function makeChipRow(scene: Scene, x: number, y: number, labels: readonly string[]): Block {
  const root = scene.add.container(x, y + 13);
  const chips = labels.map((s) => makeChip(scene, 0, 0, s));
  const gap = 8;
  const total = chips.reduce((sum, c) => sum + c.width, 0) + gap * (chips.length - 1);
  let cx = -total / 2;
  for (const c of chips) {
    c.root.setX(cx + c.width / 2);
    cx += c.width + gap;
    root.add(c.root);
  }
  return { root, height: labels.length ? 26 : 0 };
}

/* ── Экраны целиком ───────────────────────────────────────────────────────── */

export interface ResultAction {
  label: string;
  onClick(): void;
}

interface ScreenBase {
  locale: string;
  /** «Уровень 3 · Глава 1» / «Забег · 1:12». */
  caption: string;
  /** «Все пары найдены!» / «Длина 17». */
  title: string;
  lines: readonly BonusLineView[];
  total: number;
  primary: ResultAction;
  /** «В меню». */
  onMenu(): void;
  /** Маскот рядом со звёздами/заголовком: радуется или никнет. */
  mood: 'happy' | 'sad';
}

export interface LadderResultOpts extends ScreenBase {
  stars: number;
  /** Строка под звёздами: у проваленного уровня — докуда дошли («Найдено 5 пар из 8»). */
  note?: string;
  almost?: AlmostCardOpts | null;
}

export interface ArcadeResultOpts extends ScreenBase {
  chips: readonly string[];
  challenge?: ChallengeCardOpts | null;
  following?: FollowingOpts | null;
}

export interface ResultScreen {
  /** Откуда вылетает «+N» в чип баланса. */
  awardFrom: { x: number; y: number };
}

/** Появление снизу вверх с fade — по очереди, итог читается сверху вниз. */
function appear(scene: Scene, obj: Phaser.GameObjects.Container | Phaser.GameObjects.Text, delay: number) {
  if (!motionAllowed()) return;
  const toY = obj.y;
  obj.setAlpha(0);
  obj.y = toY + 14;
  scene.tweens.add({ targets: obj, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
}

function header(scene: Scene, cx: number, top: number, caption: string, title: string): number {
  const cap = text(scene, cx, top, caption, TYPE.body, S.muted).setOrigin(0.5, 0);
  const t = text(scene, cx, top + 24, title, 30, S.ink, WEIGHT.bold).setOrigin(0.5, 0);
  // Справа от заголовка сидит феникс: длинный заголовок («Yangi rekord · 23»)
  // сначала уменьшаем до 22, и только потом режем.
  const maxW = LOGICAL_W - 150;
  for (let size = 29; t.width > maxW && size >= 22; size--) t.setFontSize(size);
  fit(t, maxW);
  appear(scene, cap, 60);
  if (motionAllowed()) {
    t.setScale(0.7).setAlpha(0);
    scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 380, delay: 120, ease: 'Back.easeOut' });
  }
  return top + 24 + t.height;
}

/** Кнопки внизу колонки: primary 48 и «В меню» 40. */
function actions(scene: Scene, cx: number, y: number, o: ScreenBase, delay: number): number {
  const w = CARD_W;
  const primary = makeButton(scene, cx, y + BUTTON_H.lg / 2, o.primary.label, () => o.primary.onClick(), {
    primary: true, width: w, height: BUTTON_H.lg,
  });
  appear(scene, primary.root, delay);
  y += BUTTON_H.lg + 10;
  const menu = makeButton(scene, cx, y + BUTTON_H.md / 2, uiText(o.locale, 'result.menu'), () => o.onMenu(), {
    width: w, height: BUTTON_H.md,
  });
  appear(scene, menu.root, delay + 60);
  return y + BUTTON_H.md;
}

function mascot(scene: Scene, x: number, y: number, mood: 'happy' | 'sad') {
  const phoenix = makePhoenix(scene, x, y, 60, { facing: 'left' });
  scene.time.delayedCall(320, () => (mood === 'happy' ? phoenix.celebrate() : phoenix.sink()));
  scene.events.once('shutdown', () => phoenix.destroy());
}

/** Итог уровня лестницы — раздел 1d аудита. `top` — верх колонки. */
export function makeLadderResult(scene: Scene, o: LadderResultOpts, top = 56): ResultScreen {
  const cx = LOGICAL_W / 2;
  let y = header(scene, cx, top, o.caption, o.title) + 30;

  // Звёзды 52 px выезжают с отскоком и звенят по очереди.
  const stars = makeStarRow(scene, cx, y, o.stars, 24);
  if (motionAllowed()) {
    stars.setScale(0);
    scene.tweens.add({ targets: stars, scale: 1, duration: 380, delay: 300, ease: 'Back.easeOut' });
  }
  for (let i = 0; i < o.stars; i++) scene.time.delayedCall(340 + i * 160, () => playSound('star'));
  mascot(scene, cx + 150, y + 22, o.mood);
  y += 26 + 24;
  if (o.note) {
    const note = text(scene, cx, y - 6, o.note, TYPE.body, S.muted).setOrigin(0.5, 0)
      .setWordWrapWidth(CARD_W, true).setAlign('center');
    appear(scene, note, 420);
    y += note.height + GAP;
  }

  if (o.almost) {
    const a = makeAlmostCard(scene, cx, y, o.almost);
    appear(scene, a.root, 480);
    y += a.height + GAP;
  }
  const b = makeBonusBreakdown(scene, cx, y, { locale: o.locale, lines: o.lines, total: o.total });
  if (b.height) {
    appear(scene, b.root, 560);
    y += b.height + GAP;
  }
  actions(scene, cx, Math.max(y + 4, ACTIONS_Y), o, 660);
  return { awardFrom: b.height ? b.totalAt : { x: cx, y: top + 90 } };
}

/** Итог забега аркады — раздел 1f аудита. */
export function makeArcadeResult(scene: Scene, o: ArcadeResultOpts, top = 56): ResultScreen {
  const cx = LOGICAL_W / 2;
  let y = header(scene, cx, top, o.caption, o.title) + 10;
  mascot(scene, cx + 150, top + 40, o.mood);
  const chips = makeChipRow(scene, cx, y, o.chips);
  appear(scene, chips.root, 260);
  y += chips.height + 20;

  if (o.challenge) {
    const c = makeChallengeCard(scene, cx, y, o.challenge);
    appear(scene, c.root, 380);
    y += c.height + GAP;
  }
  if (o.following) {
    const f = makeFollowingList(scene, cx, y, o.following);
    if (f.height) {
      appear(scene, f.root, 460);
      y += f.height + GAP;
    }
  }
  const b = makeBonusBreakdown(scene, cx, y, { locale: o.locale, lines: o.lines, total: o.total });
  if (b.height) {
    appear(scene, b.root, 540);
    y += b.height + GAP;
  }
  actions(scene, cx, Math.max(y + 4, ACTIONS_Y), o, 620);
  return { awardFrom: b.height ? b.totalAt : { x: cx, y: top + 60 } };
}

/* ── «Призрак» рекорда в HUD ──────────────────────────────────────────────── */

export interface RecordGhost {
  /** Текущее значение метрики забега. */
  update(value: number): void;
  destroy(): void;
}

/**
 * Тонкая шкала под шапкой партии: заливка — текущий забег, золотая метка —
 * личный рекорд. Каждый забег становится гонкой с собой; обогнал — заливка
 * золотая. Без рекорда (первый забег) шкалы нет.
 */
export function makeRecordGhost(scene: Scene, y: number, record: number): RecordGhost {
  if (record <= 0) return { update: () => {}, destroy: () => {} };
  const x0 = 14;
  const w = LOGICAL_W - 28;
  const h = 3;
  const g = scene.add.graphics().setDepth(39);
  let last = -1;
  const draw = (value: number) => {
    const max = Math.max(record * 1.25, value * 1.05);
    g.clear();
    g.fillStyle(C.divider, 0.7).fillRoundedRect(x0, y, w, h, 1.5);
    const r = Math.min(1, value / max);
    if (r > 0) g.fillStyle(value > record ? C.gold : C.primarySoft, 1).fillRoundedRect(x0, y, Math.max(h, w * r), h, 1.5);
    const mx = x0 + w * (record / max);
    g.fillStyle(C.gold, 1).fillRect(mx - 1, y - 3, 2, h + 6);
  };
  draw(0);
  return {
    update: (value) => {
      if (value === last) return;
      last = value;
      draw(value);
    },
    destroy: () => g.destroy(),
  };
}
