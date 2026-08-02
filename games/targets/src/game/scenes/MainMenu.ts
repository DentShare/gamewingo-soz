import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton, applyTheme, setupCamera, makeTopBar, makeGameIcon, makeLevelGrid, makeLadderSummary,
  type LevelTileState,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { LADDER, LADDER_SIZE, levelAt } from '../../core/levels';
import { isUnlocked, loadProgress, nextLevel, totalStars, isLadderComplete } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'targets';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

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

    makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());

    makeGameIcon(this, CX, 92, 64);

    const progress = loadProgress(SLUG);
    const next = nextLevel(progress, LADDER_SIZE);

    makeLadderSummary(
      this,
      CX,
      142,
      t(this.locale, 'menu.ladder', { n: next, total: LADDER_SIZE }),
      totalStars(progress),
      LADDER_SIZE * 3,
    );

    // Лестница целей: пройденные со звёздами, следующая выделена, дальше — замки.
    const tiles: LevelTileState[] = LADDER.map((lv) => ({
      n: lv.n,
      unlocked: isUnlocked(progress, lv.n),
      stars: progress.stars[lv.n - 1] ?? 0,
      current: lv.n === next,
    }));
    const grid = makeLevelGrid(this, CX, 186, tiles, (n) => this.startLevel(n));

    // Что именно нужно сделать на следующем уровне.
    this.add
      .text(CX, 186 + grid.height + 14, t(this.locale, 'menu.goal', { n: levelAt(next).params.target }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const belowGrid = 186 + grid.height + 44;
    makeButton(this, CX, belowGrid, t(this.locale, 'menu.play', { n: next }), () => this.startLevel(next), {
      primary: true,
    });

    // Бесконечный режим открывается, когда вся лестница пройдена.
    let y = belowGrid + 52;
    if (isLadderComplete(progress, LADDER_SIZE)) {
      makeButton(this, CX, y, t(this.locale, 'menu.endless'), () => this.startEndless());
      y += 52;
    }
    makeButton(this, CX, y, t(this.locale, 'menu.howto'), () => this.showHowto());

    // Выбор языка — две пилюли под кнопками.
    this.langPill(CX - 92, y + 56, 'ru', 'Русский');
    this.langPill(CX + 92, y + 56, 'uz', 'Oʻzbekcha');
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 176, height: 40, primary: this.locale === loc });
  }

  private startLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('endless', false);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Забег без цели: играется на максимальной сложности, в лестницу не пишется. */
  private startEndless() {
    this.registry.set('level', LADDER_SIZE);
    this.registry.set('endless', true);
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

  /** «Как играть» — интерактивное обучение поверх настоящего поля; по концу → в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('locale', this.locale);
    this.registry.set('level', 1);
    this.scene.start('Game');
  }
}
