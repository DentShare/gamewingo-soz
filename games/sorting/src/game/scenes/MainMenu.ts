import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton, applyTheme, setupCamera, makeTopBar, makeGameIcon, makeLevelGrid, makeLadderSummary,
  type LevelTileState,
} from '../ui';
import { COLORS } from '../palette';
import { LADDER, LADDER_SIZE } from '../../core/levels';
import { isUnlocked, loadProgress, nextLevel, totalStars } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'sorting';
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

    // Лестница уровней: пройденные со звёздами, следующий выделен, дальше — замки.
    const tiles: LevelTileState[] = LADDER.map((lv) => ({
      n: lv.n,
      unlocked: isUnlocked(progress, lv.n),
      stars: progress.stars[lv.n - 1] ?? 0,
      current: lv.n === next,
    }));
    const grid = makeLevelGrid(this, CX, 186, tiles, (n) => this.startLevel(n));

    const belowGrid = 186 + grid.height + 24;
    makeButton(this, CX, belowGrid, t(this.locale, 'menu.play', { n: next }), () => this.startLevel(next), {
      primary: true,
    });
    makeButton(this, CX, belowGrid + 52, t(this.locale, 'menu.howto'), () => this.showHowto());

    // Выбор языка — две пилюли под кнопками.
    this.langPill(CX - 92, belowGrid + 108, 'ru', 'Русский');
    this.langPill(CX + 92, belowGrid + 108, 'uz', 'Oʻzbekcha');
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
