import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme } from '../ui';
import { COLORS, FONT } from '../palette';
import type { LevelId } from '../../core/board';
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

    this.add
      .text(CX, 90, '🧩', { fontFamily: FONT, fontSize: 40 })
      .setOrigin(0.5);
    this.add
      .text(CX, 148, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 42, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 214, 'ru', 'Русский');
    this.langPill(CX + 78, 214, 'uz', 'Oʻzbekcha');

    // Кнопки режимов + рекорд под каждой.
    const levels: { level: LevelId; key: string }[] = [
      { level: '3x3', key: 'menu.kids' },
      { level: '4x4', key: 'menu.classic' },
    ];
    let y = 312;
    levels.forEach(({ level, key }, i) => {
      makeButton(this, CX, y, t(this.locale, key), () => this.startLevel(level), { primary: i === 0 });
      const best = loadBest(level);
      if (best) {
        this.add
          .text(CX, y + 33, t(this.locale, 'menu.best', { score: best.score }), {
            fontFamily: FONT, fontSize: 12, color: COLORS.headMuted,
          })
          .setOrigin(0.5);
      }
      y += 82;
    });

    makeButton(this, CX, y + 8, t(this.locale, 'menu.howto'), () => this.showHowto());
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: this.locale === loc });
  }

  private startLevel(level: LevelId) {
    this.registry.set('level', level);
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
