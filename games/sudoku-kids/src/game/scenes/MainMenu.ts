import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  applyTheme,
  setupCamera,
  setBackHandler,
  makeGameIcon,
  makeKidsTopBar,
  makeKidsPathPager,
  makeKidsPlayButton,
  TOP_BAR_H,
  type KidsStop,
} from '../ui';
import { COLORS } from '../palette';
import { blockDims } from '../../core/sudoku';
import { LADDER, LADDER_SIZE, levelAt } from '../../core/levels';
import {
  chapterLevels,
  chapterOf,
  isLadderComplete,
  loadProgress,
  nextLevel,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'sudoku-kids';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

/**
 * Детское меню (T8, раздел 1g аудита): игрок 3–6 лет не читает. Иконка игры,
 * дорожка из пяти кружков (глава), поле следующего уровня картинкой —
 * маленькая сетка 4×4 или 6×6 — и одна большая кнопка «играть». Ни
 * «Уровень 3 из 15», ни замков: будущий кружок просто покачивается. Выход и
 * звук — у «Родителям» (удержание 2 с). Уровня дня в детском меню нет.
 */
export class MainMenu extends Scene {
  private locale: Locale = 'ru';

  constructor() {
    super('MainMenu');
  }

  create() {
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    makeKidsTopBar(this, { locale: this.locale, onExit: () => this.exitToCatalog() });
    // Системный «назад» в меню ничего не делает: выход — только через «Родителям».
    setBackHandler(() => {});

    const progress = loadProgress(SLUG);
    const complete = isLadderComplete(progress, LADDER_SIZE);
    // Всё пройдено — играем первый уровень, где не хватает звёзд, иначе первый.
    const next = complete
      ? LADDER.find((lv) => (progress.stars[lv.n - 1] ?? 0) < 3)?.n ?? 1
      : nextLevel(progress, LADDER_SIZE);

    makeGameIcon(this, CX, TOP_BAR_H + 84, 120);

    const chapters: KidsStop[][] = chapterLevels(LADDER_SIZE).map((levels) => levels.map((n) => {
      const stars = progress.stars[n - 1] ?? 0;
      return { n, stars, state: n === next ? 'current' : stars > 0 ? 'done' : 'future' };
    }));
    const pager = makeKidsPathPager(this, CX, TOP_BAR_H + 172, {
      chapters,
      initial: chapterOf(next) - 1,
      onPick: (n) => this.startLevel(n),
    });

    // Поле картинкой: маленькая сетка 4×4 или 6×6 — ребёнок видит, какое поле его ждёт.
    // Место под самое большое поле (6×6 в рамке — 108) с отступом от точек глав.
    const fieldY = TOP_BAR_H + 172 + pager.height + 72;
    this.drawField(fieldY, levelAt(next).params.size);

    makeKidsPlayButton(this, CX, fieldY + 112, () => this.startLevel(next));
  }

  /** Мини-поле: та же разметка, что у доски в партии, — тонкие клетки и толстые границы блоков. */
  private drawField(cy: number, n: 4 | 6) {
    // Большое поле и нарисовано больше: 6×6 заметно крупнее 4×4, клетки одного размера.
    const side = n * 16;
    const cell = side / n;
    const x0 = CX - side / 2;
    const y0 = cy - side / 2;
    const { rows: bRows, cols: bCols } = blockDims(n);
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 1).fillRoundedRect(x0 - 6, y0 - 6, side + 12, side + 12, 10);
    // Несколько «готовых цифр» — серые клетки, как на настоящей доске.
    g.fillStyle(COLORS.givenBg, 1);
    for (let i = 0; i < n * n; i++) {
      if ((i * 7 + Math.floor(i / n)) % 3 !== 0) continue;
      g.fillRect(x0 + (i % n) * cell, y0 + Math.floor(i / n) * cell, cell, cell);
    }
    g.lineStyle(1, COLORS.gridLine, 1);
    for (let i = 1; i < n; i++) {
      g.lineBetween(x0 + i * cell, y0, x0 + i * cell, y0 + side);
      g.lineBetween(x0, y0 + i * cell, x0 + side, y0 + i * cell);
    }
    g.lineStyle(2.5, COLORS.blockLine, 1);
    for (let i = 0; i <= n; i += bCols) g.lineBetween(x0 + i * cell, y0, x0 + i * cell, y0 + side);
    for (let i = 0; i <= n; i += bRows) g.lineBetween(x0, y0 + i * cell, x0 + side, y0 + i * cell);
  }

  private startLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('mode', 'level');
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Выход в каталог: событие мосту (реальный WebView вернётся к списку), а в вебе — переход на хаб. */
  private exitToCatalog() {
    const session = this.registry.get('session') as Session | undefined;
    session?.exit();
    if (this.registry.get('demo')) {
      const hub = (this.registry.get('catalogUrl') as string) || HUB_URL;
      window.location.href = hub;
    }
  }
}
