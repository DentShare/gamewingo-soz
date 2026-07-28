import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, darken } from '../ui';
import { COLORS, FONT, tileColor, tileTextColor } from '../palette';
import { loadBest } from '../../core/persistence';

const CX = 200;

export class MainMenu extends Scene {
  private locale: Locale = 'ru';

  constructor() {
    super('MainMenu');
  }

  create() {
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    applyTheme(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    this.buildLogo(t(this.locale, 'app.title'));

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 214, 'ru', 'Русский');
    this.langPill(CX + 78, 214, 'uz', 'Oʻzbekcha');

    // Одна большая кнопка «Играть» + рекорд под ней.
    makeButton(this, CX, 322, t(this.locale, 'menu.play'), () => this.startGame(), {
      primary: true, width: 248, height: 56,
    });
    const best = loadBest();
    if (best > 0) {
      this.add
        .text(CX, 362, t(this.locale, 'menu.best', { n: best }), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5);
    }

    makeButton(this, CX, 424, t(this.locale, 'menu.howto'), () => this.showHowto());
  }

  /** Заголовок-логотип: цифры названия как мини-плитки нарастающих номиналов. */
  private buildLogo(title: string) {
    const chars = title.split('');
    const size = 64, gap = 8;
    const total = chars.length * size + (chars.length - 1) * gap;
    const startX = CX - total / 2 + size / 2;
    const values = [2, 16, 256, 2048];
    chars.forEach((ch, i) => {
      const v = values[Math.min(i, values.length - 1)];
      const x = startX + i * (size + gap);
      const cont = this.add.container(x, 118).setScale(0);
      const g = this.add.graphics();
      g.fillStyle(darken(tileColor(v), 0.18), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, 14);
      g.fillStyle(tileColor(v), 1).fillRoundedRect(-size / 2, -size / 2, size, size, 14);
      const txt = this.add
        .text(0, 0, ch, { fontFamily: FONT, fontSize: 30, color: tileTextColor(v), fontStyle: 'bold' })
        .setOrigin(0.5);
      cont.add([g, txt]);
      this.tweens.add({ targets: cont, scale: 1, duration: 300, delay: 80 + i * 90, ease: 'Back.easeOut' });
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

  private showHowto() {
    const overlay = this.add
      .rectangle(CX, 360, 400, 720, 0x241a12, 0.82)
      .setInteractive()
      .setDepth(50);
    const text = this.add
      .text(CX, 360, t(this.locale, 'howto.body'), {
        fontFamily: FONT, fontSize: 18, color: '#ffffff', align: 'center',
        wordWrap: { width: 340 }, lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setDepth(51);
    overlay.on('pointerup', () => {
      overlay.destroy();
      text.destroy();
    });
  }
}
