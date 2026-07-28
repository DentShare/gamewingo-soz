import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, darken } from '../ui';
import { COLORS, FONT, blockColor } from '../palette';
import { loadBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
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
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    this.buildCatalogLink();

    this.add
      .text(CX, 96, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 44, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(CX, 134, t(this.locale, 'app.tagline'), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted, align: 'center',
        wordWrap: { width: 300 },
      })
      .setOrigin(0.5);

    this.buildTowerArt(320);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 386, 'ru', 'Русский');
    this.langPill(CX + 78, 386, 'uz', 'Oʻzbekcha');

    // Аркада: одна большая кнопка «Играть», без выбора сложности.
    const play = makeButton(this, CX, 476, t(this.locale, 'menu.play'), () => this.startGame(), {
      primary: true, width: 264, height: 62,
    });
    this.tweens.add({
      targets: play.root, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const best = loadBest();
    this.add
      .text(CX, 524, best === null ? '' : t(this.locale, 'menu.best', { score: best }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5);

    makeButton(this, CX, 584, t(this.locale, 'menu.howto'), () => this.showHowto());
  }

  /** Декоративная башенка на меню — сразу объясняет, во что играем. */
  private buildTowerArt(bottomY: number) {
    const g = this.add.graphics();
    const h = 22;
    const widths = [168, 152, 152, 134, 118, 96];
    const offsets = [0, 10, -8, 6, -4, 12];
    widths.forEach((w, i) => {
      const color = blockColor(i * 2);
      const y = bottomY - (widths.length - i) * (h + 3);
      const x = CX - w / 2 + offsets[i];
      g.fillStyle(darken(color, 0.22), 1).fillRoundedRect(x, y + 3, w, h, 5);
      g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, 5);
    });
    // Тень-основание.
    g.fillStyle(COLORS.shade, 1).fillRoundedRect(CX - 96, bottomY - 6, 192, 10, 5);
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
