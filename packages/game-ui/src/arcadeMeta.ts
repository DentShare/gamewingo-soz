import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT } from './tokens.js';
import { DPR } from './viewport.js';
import { makeStarRow } from './levels.js';

/**
 * Виджеты меню аркад: рекорд, полоса до следующей вехи и список испытаний.
 * У аркад нет сетки уровней — их прогрессия «вехи + испытания + рекорды»,
 * и меню собирается из этих трёх блоков. Все строки приходят готовыми:
 * виджеты не знают языка (правило локализации каталога).
 */

/** Ширина карточек — как у кнопок каталога (336) и сетки уровней (348). */
const CARD_W = 348;

/** Крупный личный рекорд под иконкой игры. */
export function makeRecordBadge(
  scene: Scene,
  x: number,
  y: number,
  input: { label: string; value: string },
): Phaser.GameObjects.Container {
  const value = scene.add
    .text(0, 0, input.value, {
      fontFamily: FONT, fontSize: 34, fontStyle: WEIGHT.bold, color: S.ink,
    })
    .setOrigin(0.5, 0.5)
    .setResolution(DPR);
  const label = scene.add
    .text(0, 26, input.label, { fontFamily: FONT, fontSize: TYPE.caption, color: S.muted })
    .setOrigin(0.5, 0.5)
    .setResolution(DPR);
  return scene.add.container(x, y, [value, label]);
}

/**
 * Полоса до следующей вехи: подпись, прогресс-бар и «сколько из скольких».
 * Когда все вехи взяты, бар полон и подпись говорит об этом (текст решает игра).
 */
export function makeMilestoneBar(
  scene: Scene,
  x: number,
  y: number,
  input: { label: string; value: number; target: number },
): Phaser.GameObjects.Container {
  const label = scene.add
    .text(-CARD_W / 2, -14, input.label, { fontFamily: FONT, fontSize: TYPE.caption, color: S.muted })
    .setOrigin(0, 0.5)
    .setResolution(DPR);
  const counter = scene.add
    .text(CARD_W / 2, -14, `${Math.min(input.value, input.target)} / ${input.target}`, {
      fontFamily: FONT, fontSize: TYPE.caption, fontStyle: WEIGHT.semibold, color: S.gold,
    })
    .setOrigin(1, 0.5)
    .setResolution(DPR);

  const g = scene.add.graphics();
  const barW = CARD_W;
  const barH = 8;
  const ratio = input.target > 0 ? Math.max(0, Math.min(1, input.value / input.target)) : 1;
  g.fillStyle(C.divider, 1).fillRoundedRect(-barW / 2, 0, barW, barH, barH / 2);
  if (ratio > 0) {
    g.fillStyle(C.gold, 1).fillRoundedRect(-barW / 2, 0, Math.max(barH, barW * ratio), barH, barH / 2);
  }
  return scene.add.container(x, y, [label, counter, g]);
}

export interface ChallengeRowState {
  n: number;
  /** Готовая локализованная строка испытания. */
  text: string;
  done: boolean;
  /** Текущее (первое невыполненное) — подсвечено. */
  active: boolean;
}

export interface ChallengeList {
  root: Phaser.GameObjects.Container;
  height: number;
}

const ROW_H = 44;
const ROW_GAP = 8;

/** Галочка выполненного испытания. */
function drawCheck(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  g.fillStyle(C.success, 1).fillCircle(x, y, r);
  g.lineStyle(2.4, C.white, 1);
  g.beginPath();
  g.moveTo(x - r * 0.42, y + r * 0.05);
  g.lineTo(x - r * 0.08, y + r * 0.4);
  g.lineTo(x + r * 0.46, y - r * 0.34);
  g.strokePath();
}

/** Дужка и корпус маленького замка — ещё не открытое испытание. */
function drawLockSmall(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number): void {
  const w = size * 0.62, h = size * 0.5, r = size * 0.26;
  g.lineStyle(size * 0.14, C.muted, 1);
  g.beginPath();
  g.arc(x, y - h * 0.55, r, Math.PI, 0);
  g.strokePath();
  g.fillStyle(C.muted, 1).fillRoundedRect(x - w / 2, y - h * 0.15, w, h, size * 0.12);
}

/**
 * Список испытаний: заголовок со счётом, последнее выполненное (для контекста),
 * активное с оранжевой рамкой и пара следующих под замком. `header` — готовая
 * строка вида «Испытания · 4 из 15».
 */
export function makeChallengeList(
  scene: Scene,
  x: number,
  topY: number,
  input: { header: string; rows: readonly ChallengeRowState[] },
): ChallengeList {
  const root = scene.add.container(0, 0);

  const header = scene.add
    .text(x - CARD_W / 2, topY, input.header, {
      fontFamily: FONT, fontSize: TYPE.caption, fontStyle: WEIGHT.semibold, color: S.muted,
    })
    .setOrigin(0, 0.5)
    .setResolution(DPR);
  root.add(header);

  // Окно вокруг активного: одно выполненное сверху + активное + два следующих.
  const activeIdx = input.rows.findIndex((r) => r.active);
  const start = Math.max(0, (activeIdx === -1 ? input.rows.length : activeIdx) - 1);
  const visible = input.rows.slice(start, start + 4);

  let y = topY + 16 + ROW_H / 2;
  for (const row of visible) {
    root.add(makeChallengeRow(scene, x, y, row));
    y += ROW_H + ROW_GAP;
  }

  return { root, height: y - ROW_H / 2 - ROW_GAP - topY };
}

function makeChallengeRow(
  scene: Scene,
  x: number,
  y: number,
  row: ChallengeRowState,
): Phaser.GameObjects.Container {
  const locked = !row.done && !row.active;
  const g = scene.add.graphics();
  g.fillStyle(row.done ? C.slotSoft : C.surface, 1)
    .fillRoundedRect(-CARD_W / 2, -ROW_H / 2, CARD_W, ROW_H, RADIUS.card);
  g.lineStyle(row.active ? 2 : 1, row.active ? C.primary : C.divider, 1)
    .strokeRoundedRect(-CARD_W / 2, -ROW_H / 2, CARD_W, ROW_H, RADIUS.card);

  const iconX = -CARD_W / 2 + 24;
  if (row.done) {
    drawCheck(g, iconX, 0, 10);
  } else if (locked) {
    drawLockSmall(g, iconX, 0, 20);
  } else {
    g.fillStyle(C.primary, 1).fillCircle(iconX, 0, 10);
  }

  const items: Phaser.GameObjects.GameObject[] = [g];
  if (!row.done && !locked) {
    items.push(
      scene.add
        .text(iconX, 0, String(row.n), {
          fontFamily: FONT, fontSize: 11, fontStyle: WEIGHT.bold, color: S.white,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
    );
  }

  items.push(
    scene.add
      .text(iconX + 22, 0, row.text, {
        fontFamily: FONT, fontSize: TYPE.body, color: locked ? S.muted : S.ink,
        fontStyle: row.active ? WEIGHT.semibold : WEIGHT.regular,
      })
      .setOrigin(0, 0.5)
      .setResolution(DPR),
  );

  if (row.done) {
    items.push(makeStarRow(scene, CARD_W / 2 - 36, 0, 3, 6));
  }

  const root = scene.add.container(x, y, items);
  if (locked) root.setAlpha(0.6);
  return root;
}
