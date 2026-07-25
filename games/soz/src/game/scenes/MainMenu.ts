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
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    this.add
      .text(CX, 96, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 44, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 168, 'ru', 'Русский');
    this.langPill(CX + 78, 168, 'uz', 'Oʻzbekcha');

    // Режимы (на выбранном языке).
    makeButton(this, CX, 292, t(this.locale, 'menu.daily'), () => this.startMode('daily'), { primary: true });
    makeButton(this, CX, 358, t(this.locale, 'menu.practice'), () => this.startMode('practice'));
    makeButton(this, CX, 424, t(this.locale, 'menu.howto'), () => this.showHowto());

    const label = () =>
      `${t(this.locale, 'a11y.highContrast')}: ${this.registry.get('highContrast') ? '✓' : '×'}`;
    let btn: Button;
    btn = makeButton(this, CX, 548, label(), () => {
      this.registry.set('highContrast', !this.registry.get('highContrast'));
      btn.setLabel(label());
    });
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    const selected = this.locale === loc;
    const b = makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: selected });
    return b;
  }

  private startMode(mode: 'daily' | 'practice') {
    this.registry.set('mode', mode);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  private showHowto() {
    const lines = t(this.locale, 'howto.body');
    const overlay = this.add
      .rectangle(CX, 360, 400, 720, 0x241a12, 0.82)
      .setInteractive()
      .setDepth(50);
    const text = this.add
      .text(CX, 360, lines, {
        fontFamily: FONT, fontSize: 18, color: '#ffffff', align: 'center',
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
