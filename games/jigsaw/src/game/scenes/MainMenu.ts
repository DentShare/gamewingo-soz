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
  C,
  type KidsStop,
} from '../ui';
import { COLORS } from '../palette';
import { LADDER, LADDER_SIZE, levelAt } from '../../core/levels';
import { BASE_FRAME, ensurePictureTexture } from '../picture';
import {
  chapterLevels,
  chapterOf,
  isLadderComplete,
  loadProgress,
  nextLevel,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'jigsaw';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';
/** Превью следующей картинки, разрезанной сеткой уровня. */
const PREVIEW = 104;

/**
 * Детское меню (T8, раздел 1g аудита): игрок 3–6 лет не читает. Иконка игры,
 * дорожка из пяти кружков (глава), следующая картинка, разрезанная на столько
 * кусочков, сколько будет в партии, — и одна большая кнопка «играть». Ни
 * «Картинка 3 из 15», ни замков: будущий кружок просто покачивается.
 * Выход и звук — у «Родителям» (удержание 2 с).
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
    // Всё собрано — играем первую картинку, где не хватает звёзд, иначе первую.
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

    // Рычаг картинкой: следующая картинка, разрезанная сеткой уровня, — сразу
    // видно, что собираем и на сколько кусочков. Без текста и цифр.
    const previewY = TOP_BAR_H + 172 + pager.height + 28 + PREVIEW / 2;
    this.drawPreview(previewY, next);

    makeKidsPlayButton(this, CX, previewY + PREVIEW / 2 + 70, () => this.startLevel(next));
  }

  /** Картинка уровня n, рассечённая линиями цвета фона на cols × rows кусочков. */
  private drawPreview(y: number, n: number) {
    const { picture, cols, rows } = levelAt(n).params;
    const key = ensurePictureTexture(this, picture);
    const left = CX - PREVIEW / 2;
    const top = y - PREVIEW / 2;
    const frame = this.add.graphics();
    frame.fillStyle(C.surface, 1).fillRoundedRect(left - 6, top - 6, PREVIEW + 12, PREVIEW + 12, 14);
    frame.lineStyle(1, C.divider, 1).strokeRoundedRect(left - 6, top - 6, PREVIEW + 12, PREVIEW + 12, 14);
    this.add.image(CX, y, key, BASE_FRAME).setDisplaySize(PREVIEW, PREVIEW);
    const cuts = this.add.graphics();
    cuts.lineStyle(3, C.surface, 1);
    for (let c = 1; c < cols; c++) {
      const x = left + (PREVIEW * c) / cols;
      cuts.lineBetween(x, top, x, top + PREVIEW);
    }
    for (let r = 1; r < rows; r++) {
      const ly = top + (PREVIEW * r) / rows;
      cuts.lineBetween(left, ly, left + PREVIEW, ly);
    }
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
