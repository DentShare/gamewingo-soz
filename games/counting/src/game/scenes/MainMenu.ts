import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera } from '../ui';
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

    this.buildCatalogLink();

    this.add
      .text(CX, 118, '🔢', { fontFamily: FONT, fontSize: 44 })
      .setOrigin(0.5)
      .setResolution(DPR);
    this.add
      .text(CX, 180, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 42, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    // Наглядный намёк на механику: предметы и цифра.
    this.add
      .text(CX, 232, '🍎 🍎 🍎  =  3', {
        fontFamily: FONT, fontSize: 22, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 296, 'ru', 'Русский');
    this.langPill(CX + 78, 296, 'uz', 'Oʻzbekcha');

    makeButton(this, CX, 402, t(this.locale, 'menu.play'), () => this.startGame(), {
      primary: true, width: 260, height: 64,
    });

    const best = loadBest();
    if (best) {
      this.add
        .text(CX, 452, t(this.locale, 'menu.best', { score: best.score }), {
          fontFamily: FONT, fontSize: 14, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    makeButton(this, CX, 512, t(this.locale, 'menu.howto'), () => this.showHowto());
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
    this.scene.start('Game');
  }
}
