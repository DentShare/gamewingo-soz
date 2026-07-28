import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme } from '../ui';
import { COLORS, FONT } from '../palette';
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
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    this.buildCatalogLink();

    // Декоративная мишень над заголовком — «пульсирует», как живая цель.
    const emblem = this.add
      .text(CX, 128, '🎯', { fontFamily: FONT, fontSize: 68 })
      .setOrigin(0.5);
    this.tweens.add({
      targets: emblem, scale: 1.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.add
      .text(CX, 208, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 40, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(CX, 244, t(this.locale, 'app.tagline'), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
      })
      .setOrigin(0.5);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 306, 'ru', 'Русский');
    this.langPill(CX + 78, 306, 'uz', 'Oʻzbekcha');

    // Одна кнопка на всю аркаду: зашёл и играешь.
    const play = makeButton(this, CX, 416, t(this.locale, 'menu.play'), () => this.startRound(), {
      primary: true, width: 264, height: 62,
    });
    this.tweens.add({
      targets: play.root, scale: 1.03, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const best = loadBest();
    this.add
      .text(CX, 466, best ? t(this.locale, 'menu.best', { score: best.score }) : ' ', {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted,
      })
      .setOrigin(0.5);

    makeButton(this, CX, 528, t(this.locale, 'menu.howto'), () => this.showHowto());
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: this.locale === loc });
  }

  private startRound() {
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
