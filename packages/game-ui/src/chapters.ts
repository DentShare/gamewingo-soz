import type { Scene } from 'phaser';
import { C, S, FONT, RADIUS, TYPE, WEIGHT } from './tokens.js';
import { DPR } from './viewport.js';
import { makeButton, makeChip } from './widgets.js';
import { drawLock, makeLevelGrid, TILE, type LevelTileState } from './levels.js';
import { uiText } from './strings.js';

/**
 * Меню лестницы по главам (T7 UX-волны): карточка «Следующий», главы по пять
 * уровней и карточка «Уровень дня». Макет — раздел 1c аудита.
 *
 * Виджеты не знают правил прогресса: что открыто и сколько звёзд — считает
 * `@gamewingo/game-progress`, что за рычаг на уровне — словарь игры. Здесь
 * только вид, поэтому все игры каталога выглядят одинаково.
 */

/** Ширина карточек меню: поле 400 с полями по 20. */
export const CARD_W = 360;

export interface Block {
  root: Phaser.GameObjects.Container;
  /** Высота блока — чтобы поставить следующий под ним. */
  height: number;
}

const text = (
  scene: Scene, x: number, y: number, s: string,
  size: number, color: string, weight: string = WEIGHT.regular,
) => scene.add
  .text(x, y, s, { fontFamily: FONT, fontSize: size, fontStyle: weight, color })
  .setResolution(DPR);

/** Белая карточка с тонкой тенью-обводкой; координаты — левый верх. */
function card(scene: Scene, w: number, h: number, fill: number = C.surface): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(fill, 1).fillRoundedRect(0, 0, w, h, RADIUS.card);
  if (fill === C.surface) g.lineStyle(1, C.divider, 0.6).strokeRoundedRect(0, 0, w, h, RADIUS.card);
  return g;
}

export interface NextLevelCardOpts {
  locale: string;
  n: number;
  /** Своё название уровня, если игра зовёт их иначе: «Картинка 3» в пазле. */
  title?: string;
  /** Собрано звёзд и максимум по лестнице — «★ 14 / 45» справа вверху. */
  stars: number;
  maxStars: number;
  /** Чип поля: «9 пар», «4×4». */
  field?: string;
  /** Что нового на уровне — без префикса: «лимит 20 ходов». */
  intro?: string;
  /** Порог трёх звёзд: «3 звезды — не больше 13 ходов». */
  goldHint?: string;
  /** Вся лестница пройдена — предлагаем добрать звёзды, а не «следующий». */
  improve?: boolean;
  onPlay(): void;
}

/**
 * Карточка «Следующий»: номер уровня, рычаг, который на нём появляется, и
 * порог трёх звёзд — до старта, а не на поле. `x` — центр, `y` — верх.
 */
export function makeNextLevelCard(scene: Scene, x: number, y: number, o: NextLevelCardOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  const pad = 16;
  const items: Phaser.GameObjects.GameObject[] = [];
  let cy = pad;

  items.push(text(scene, pad, cy, uiText(o.locale, o.improve ? 'next.improve' : 'next.caption'), TYPE.caption, S.muted));
  items.push(
    text(scene, CARD_W - pad, cy, uiText(o.locale, 'stars', { s: o.stars, m: o.maxStars }), TYPE.caption, S.gold, WEIGHT.semibold)
      .setOrigin(1, 0),
  );
  cy += 22;
  items.push(text(scene, pad, cy, o.title ?? uiText(o.locale, 'next.level', { n: o.n }), TYPE.title + 2, S.ink, WEIGHT.bold));
  cy += 34;

  // Чипы в ряд слева направо: поле, потом новое.
  const chips: Array<{ s: string; tone: 'default' | 'success' }> = [];
  if (o.field) chips.push({ s: o.field, tone: 'default' });
  if (o.intro) chips.push({ s: uiText(o.locale, 'intro', { text: o.intro }), tone: 'success' });
  if (chips.length) {
    // Чипы в ряд; не влезающий в ширину карточки уходит на следующую строку.
    let cx = pad;
    for (const c of chips) {
      const chip = makeChip(scene, 0, 0, c.s, 0, c.tone);
      const w = chip.width;
      if (cx > pad && cx + w > CARD_W - pad) {
        cx = pad;
        cy += 34;
      }
      chip.root.setPosition(cx + w / 2, cy + 13);
      cx += w + 8;
      items.push(chip.root);
    }
    cy += 36;
  }
  if (o.goldHint) {
    items.push(text(scene, pad, cy, o.goldHint, TYPE.caption, S.muted));
    cy += 24;
  }
  cy += 4;
  const btnW = CARD_W - pad * 2;
  const btn = makeButton(scene, CARD_W / 2, cy + 22, uiText(o.locale, 'next.play'), () => o.onPlay(), {
    primary: true, width: btnW, height: 44,
  });
  cy += 44 + pad;

  root.add([card(scene, CARD_W, cy), ...items, btn.root]);
  return { root, height: cy };
}

export interface ChapterSectionOpts {
  locale: string;
  n: number;
  /** Название по рычагу: «Лимит ходов». */
  title: string;
  levels: readonly LevelTileState[];
  cleared: number;
  done: boolean;
  unlocked: boolean;
  stars: number;
  maxStars: number;
  /** Бонус за закрытую главу — «за главу +50». */
  bonus: number;
  /** Показывать плитки; свёрнутая глава — одна строка. */
  expanded: boolean;
  onPick(n: number): void;
  /** Тап по заголовку открытой главы — развернуть её вместо текущей. */
  onToggle?(): void;
}

/**
 * Глава: заголовок «Глава 2 · Лимит ходов» и справа состояние, под ним — пять
 * плиток. Закрытые уровни видны номером и приглушены: путь читается целиком.
 */
export function makeChapterSection(scene: Scene, x: number, y: number, o: ChapterSectionOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  const titleColor = o.expanded || !o.done ? S.ink : S.muted;
  const title = text(scene, 4, 0, uiText(o.locale, 'chapter.title', { n: o.n, title: o.title }), TYPE.body, titleColor, WEIGHT.semibold);
  const rightText = !o.unlocked
    ? uiText(o.locale, 'chapter.locked', { n: o.n - 1 })
    : o.done
      ? uiText(o.locale, 'chapter.done', { s: o.stars, m: o.maxStars })
      : uiText(o.locale, 'chapter.progress', { k: o.cleared, n: o.levels.length, bonus: o.bonus });
  const right = text(scene, CARD_W - 4, 2, rightText, TYPE.caption, o.done ? S.success : S.muted, o.done ? WEIGHT.semibold : WEIGHT.regular)
    .setOrigin(1, 0);
  // Длинное название на узком экране не должно слипаться с правой подписью:
  // укорачиваем его с многоточием, правая подпись важнее (там состояние главы).
  const room = CARD_W - 4 - right.width - 12 - 4;
  if (title.width > room) {
    let s = title.text;
    while (s.length > 1 && title.width > room) {
      s = s.slice(0, -1);
      title.setText(`${s.trimEnd()}…`);
    }
  }
  root.add([title, right]);
  if (!o.unlocked) root.setAlpha(0.6);

  let height = 22;
  if (o.expanded) {
    const grid = makeLevelGrid(scene, CARD_W / 2, 32, o.levels, (n) => o.onPick(n), { lockedStyle: 'number' });
    root.add(grid.root);
    height = 32 + TILE;
  }

  if (o.onToggle && o.unlocked && !o.expanded) {
    const hit = scene.add.rectangle(CARD_W / 2, 11, CARD_W, 36, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => o.onToggle?.());
    root.add(hit);
  }
  return { root, height };
}

export interface DailyLevelCardOpts {
  locale: string;
  state: 'locked' | 'ready' | 'done';
  bonus: number;
  /** Номер уровня, после которого открывается — для подписи закрытой карточки. */
  unlockAfter: number;
  onPlay(): void;
}

/**
 * Карточка «Уровень дня»: мягкая оранжевая подложка, справа замок, кнопка или
 * отметка «пройден». Один и тот же расклад у всех игроков — есть что сравнить.
 */
export function makeDailyLevelCard(scene: Scene, x: number, y: number, o: DailyLevelCardOpts): Block {
  const root = scene.add.container(x - CARD_W / 2, y);
  const sub = o.state === 'locked'
    ? uiText(o.locale, 'daily.locked', { bonus: o.bonus, n: o.unlockAfter })
    : o.state === 'done'
      ? uiText(o.locale, 'daily.done')
      : uiText(o.locale, 'daily.ready', { bonus: o.bonus });
  const rightSpace = o.state === 'ready' ? 104 : 44;
  const title = text(scene, 14, 13, uiText(o.locale, 'daily.title'), TYPE.body, S.ink, WEIGHT.semibold);
  const subtitle = text(scene, 14, 34, sub, TYPE.caption, S.muted)
    .setWordWrapWidth(CARD_W - 14 - rightSpace, true);
  // Подпись закрытой карточки длиннее и может уйти на вторую строку — карточка растёт.
  const H = Math.max(64, 34 + subtitle.height + 12);
  const items: Phaser.GameObjects.GameObject[] = [card(scene, CARD_W, H, C.tint), title, subtitle];

  if (o.state === 'locked') {
    const lock = scene.add.graphics();
    drawLock(lock, 26);
    items.push(scene.add.container(CARD_W - 26, H / 2, [lock]));
  } else if (o.state === 'done') {
    const tick = scene.add.graphics();
    tick.lineStyle(3, C.success, 1).beginPath();
    tick.moveTo(-8, 0); tick.lineTo(-2, 6); tick.lineTo(9, -6);
    tick.strokePath();
    items.push(scene.add.container(CARD_W - 26, H / 2, [tick]));
  } else {
    const btn = makeButton(scene, CARD_W - 14 - 44, H / 2, uiText(o.locale, 'daily.play'), () => o.onPlay(), {
      primary: true, width: 88, height: 36,
    });
    items.push(btn.root);
  }
  root.add(items);
  return { root, height: H };
}
