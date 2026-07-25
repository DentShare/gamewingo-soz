import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, type Button } from '../ui';
import { COLORS, FONT } from '../palette';

const CX = 200;

export class MainMenu extends Scene {
  private locale: Locale = 'ru';

  constructor() {
    super('MainMenu');
  }

  create() {
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    applyTheme(this);
    this.cameras.main.fadeIn(200, 17, 19, 23);

    this.add
      .text(CX, 130, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 46, color: '#e9e9ea', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    makeButton(this, CX, 300, t(this.locale, 'menu.daily'), () => this.startMode('daily'), { primary: true });
    makeButton(this, CX, 370, t(this.locale, 'menu.practice'), () => this.startMode('practice'));
    makeButton(this, CX, 440, t(this.locale, 'menu.howto'), () => this.showHowto());

    const label = () =>
      `${t(this.locale, 'a11y.highContrast')}: ${this.registry.get('highContrast') ? '✓' : '×'}`;
    let btn: Button;
    btn = makeButton(this, CX, 560, label(), () => {
      this.registry.set('highContrast', !this.registry.get('highContrast'));
      btn.setLabel(label());
    });
  }

  private startMode(mode: 'daily' | 'practice') {
    this.registry.set('mode', mode);
    this.scene.start('Game');
  }

  private showHowto() {
    const lines = t(this.locale, 'howto.body');
    const overlay = this.add
      .rectangle(CX, 360, 400, 720, 0x000000, 0.75)
      .setInteractive()
      .setDepth(50);
    const text = this.add
      .text(CX, 360, lines, {
        fontFamily: FONT, fontSize: 18, color: COLORS.headText, align: 'center',
        wordWrap: { width: 340 },
      })
      .setOrigin(0.5)
      .setDepth(51);
    overlay.on('pointerup', () => {
      overlay.destroy();
      text.destroy();
    });
  }
}
