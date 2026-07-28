import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Mode } from '../../core/sorting';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera } from '../ui';
import { COLORS, FIGURE_COLORS, FONT } from '../palette';
import { drawBin, drawFigure } from '../shapes';
import { DPR } from '../dpr';
import { loadBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена.
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

    this.buildCatalogLink();

    this.add
      .text(CX, 92, '🎨', { fontFamily: FONT, fontSize: 40 })
      .setOrigin(0.5)
      .setResolution(DPR);
    this.add
      .text(CX, 146, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 38, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 208, 'ru', 'Русский');
    this.langPill(CX + 78, 208, 'uz', 'Oʻzbekcha');

    // Два режима: сортируем по цвету либо по форме.
    const modes: Mode[] = ['color', 'shape'];
    let y = 300;
    modes.forEach((mode, i) => {
      makeButton(
        this,
        CX,
        y,
        t(this.locale, mode === 'color' ? 'menu.byColor' : 'menu.byShape'),
        () => this.startMode(mode),
        { primary: i === 0 },
      );
      const best = loadBest(mode);
      if (best) {
        this.add
          .text(CX, y + 33, t(this.locale, 'menu.best', { score: best.score }), {
            fontFamily: FONT, fontSize: 12, color: COLORS.headMuted,
          })
          .setOrigin(0.5)
          .setResolution(DPR);
      }
      y += 82;
    });

    makeButton(this, CX, y + 8, t(this.locale, 'menu.howto'), () => this.showHowto());

    this.buildPreview(618);
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: this.locale === loc });
  }

  /** Декоративная иллюстрация внизу: три корзины с фигурками — сразу понятно, что делать. */
  private buildPreview(baseY: number) {
    const g = this.add.graphics();
    const colors = [FIGURE_COLORS.red, FIGURE_COLORS.yellow, FIGURE_COLORS.blue];
    const shapes = ['circle', 'square', 'triangle'] as const;
    for (let i = 0; i < 3; i++) {
      const x = CX + (i - 1) * 104;
      g.translateCanvas(x, baseY);
      drawBin(g, 74, 62, colors[i]);
      g.translateCanvas(-x, -baseY);
      drawFigure(g, shapes[i], 30, colors[i], x, baseY - 78);
    }
  }

  private startMode(mode: Mode) {
    this.registry.set('mode', mode);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Ссылка «‹ К играм» слева вверху — выход в каталог игр WinGo. */
  private buildCatalogLink() {
    const link = this.add
      .text(16, 30, `‹ ${t(this.locale, 'menu.catalog')}`, {
        fontFamily: FONT, fontSize: 15, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setResolution(DPR)
      .setInteractive({ useHandCursor: true });
    link.on('pointerup', () => this.exitToCatalog());
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
    this.registry.set('mode', 'color');
    this.scene.start('Game');
  }
}
