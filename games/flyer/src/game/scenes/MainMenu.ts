import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeTopBar } from '../ui';
import { COLORS, FONT } from '../palette';
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

    makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());
    this.buildHeader();

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 344, 'ru', 'Русский');
    this.langPill(CX + 78, 344, 'uz', 'Oʻzbekcha');

    // Аркада: одна кнопка «Играть», никакого выбора уровней.
    const play = makeButton(this, CX, 446, t(this.locale, 'menu.play'), () => this.startGame(), { primary: true });
    this.tweens.add({
      targets: play.root, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const best = loadBest();
    if (best > 0) {
      this.add
        .text(CX, 492, t(this.locale, 'menu.best', { score: best }), {
          fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    makeButton(this, CX, 552, t(this.locale, 'menu.howto'), () => this.showHowto());

    this.add
      .text(CX, 616, t(this.locale, 'menu.hint'), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted, align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Небесная карточка с героем — сразу понятно, про что игра. */
  private buildHeader() {
    const x = 24, y = 64, w = 352, h = 172, r = 22;
    const g = this.add.graphics();
    g.fillStyle(COLORS.skyBottom, 1).fillRoundedRect(x, y, w, h, r);
    g.fillStyle(COLORS.skyTop, 0.55).fillRoundedRect(x, y, w, h * 0.55, r);
    g.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(x, y, w, h, r);
    g.fillStyle(COLORS.cloud, 0.95);
    g.fillCircle(96, 118, 17);
    g.fillCircle(118, 112, 12);
    g.fillCircle(78, 122, 11);
    g.fillCircle(300, 176, 15);
    g.fillCircle(322, 170, 11);
    g.fillStyle(COLORS.ground, 1).fillRoundedRect(x, y + h - 26, w, 26, { tl: 0, tr: 0, bl: r, br: r });

    const hero = this.add
      .text(CX, 148, '🚀', { fontSize: 58 })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setRotation(Math.PI / 4);
    this.tweens.add({
      targets: hero, y: 132, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add
      .text(CX, 282, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 42, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: this.locale === loc });
  }

  private startGame() {
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Ссылка «‹ К играм» слева вверху — выход в каталог игр WinGo. */

  /** Выход в каталог: событие мосту (реальный WebView вернётся к списку), а в вебе — переход на хаб. */
  private exitToCatalog() {
    const session = this.registry.get('session') as Session | undefined;
    session?.exit();
    if (this.registry.get('demo')) {
      const hub = (this.registry.get('catalogUrl') as string) || HUB_URL;
      window.location.href = hub;
    }
  }

  /** «Как играть» — обучение поверх настоящего экрана игры; по концу → назад в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }
}
