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
import { LADDER, LADDER_SIZE } from '../../core/levels';
import {
  chapterLevels,
  chapterOf,
  isLadderComplete,
  loadProgress,
  nextLevel,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'counting';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

/**
 * Детское меню (T8, раздел 1g аудита): игрок 3–6 лет не читает. Иконка игры,
 * дорожка из пяти кружков (глава) и одна большая кнопка «играть». Ни «Уровень
 * 3 из 15», ни замков: будущий кружок просто покачивается. Выход и звук — у
 * «Родителям» (удержание 2 с). Режима картинкой нет: рычаги «Счёта» — до
 * скольки считаем, сколько кнопок и вопросов — ребёнок увидит в самой партии.
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

    makeKidsPlayButton(this, CX, TOP_BAR_H + 172 + pager.height + 90, () => this.startLevel(next));
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
