import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, darken, setupCamera, makeTopBar, makeGameIcon } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { loadBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /snake/, хаб — на корне того же домена,
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
    this.buildLogo();

    makeGameIcon(this, CX, 148, 104);
    this.add
      .text(CX, 232, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 44, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 300, 'ru', 'Русский');
    this.langPill(CX + 78, 300, 'uz', 'Oʻzbekcha');

    // Аркада: одна кнопка «Играть», никакого выбора уровней.
    makeButton(this, CX, 392, t(this.locale, 'menu.play'), () => this.startGame(), {
      primary: true, width: 248, height: 56,
    });

    const best = loadBest();
    if (best > 0) {
      this.add
        .text(CX, 438, t(this.locale, 'menu.best', { score: best }), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    makeButton(this, CX, 496, t(this.locale, 'menu.howto'), () => this.showHowto());
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

  /** Логотип: векторная змейка волной ползёт к ягоде (те же цвета, что в игре). */
  private buildLogo() {
    const n = 7;
    const gap = 30;
    const seg = 26;
    const wave = (i: number) => Math.sin(i * 0.85) * 12;

    for (let i = 0; i < n; i++) {
      const isHead = i === n - 1;
      const x = CX + (i - (n - 1) / 2) * gap;
      const y = 150 + wave(i);
      const color = isHead ? COLORS.snakeHead : (i % 2 === 0 ? COLORS.snakeBody : COLORS.snakeBodyAlt);
      const size = isHead ? seg + 4 : seg;

      const cont = this.add.container(x, y).setScale(0);
      const g = this.add.graphics();
      g.fillStyle(darken(color, 0.22), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, 9);
      g.fillStyle(color, 1).fillRoundedRect(-size / 2, -size / 2, size, size, 9);
      cont.add(g);
      if (isHead) {
        cont.add([
          this.add.circle(4, -6, 3.6, COLORS.snakeEye),
          this.add.circle(4, 6, 3.6, COLORS.snakeEye),
          this.add.circle(6, -6, 1.7, COLORS.snakeEyeDot),
          this.add.circle(6, 6, 1.7, COLORS.snakeEyeDot),
        ]);
      }
      this.tweens.add({ targets: cont, scale: 1, duration: 300, delay: 60 + i * 70, ease: 'Back.easeOut' });
    }

    // Ягода перед головой — цель змейки.
    const fx = CX + ((n - 1) / 2) * gap + 34;
    const fy = 150 + wave(n - 1);
    const food = this.add.container(fx, fy).setScale(0);
    const fg = this.add.graphics();
    fg.fillStyle(darken(COLORS.food, 0.25), 1).fillCircle(0, 2, 9);
    fg.fillStyle(COLORS.food, 1).fillCircle(0, 0, 9);
    food.add([fg, this.add.circle(-3, -4, 2.6, 0xffffff, 0.75)]);
    this.tweens.add({ targets: food, scale: 1, duration: 320, delay: 60 + n * 70, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: food, scale: 1.14, duration: 620, yoyo: true, repeat: -1,
      delay: 400 + n * 70, ease: 'Sine.easeInOut',
    });
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

  /** «Как играть» — интерактивное обучение поверх настоящего поля; по концу → обратно в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }
}
