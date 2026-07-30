import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeTopBar, makeGameIcon } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import type { LevelId } from '../../core/sudoku';
import { loadBest } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
/** Каталог лежит на `/`, игра — на `/<slug>/`, поэтому путь относительный. */
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

    makeGameIcon(this, CX, 96, 84);
    this.add
      .text(CX, 148, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 42, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 214, 'ru', 'Русский');
    this.langPill(CX + 78, 214, 'uz', 'Oʻzbekcha');

    // Кнопки уровней + рекорд под каждой.
    const levels: LevelId[] = ['easy4', 'easy6', 'hard6'];
    let y = 312;
    levels.forEach((level, i) => {
      makeButton(this, CX, y, t(this.locale, `menu.${level}`), () => this.startLevel(level), { primary: i === 0 });
      const best = loadBest(level);
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
  }

  /** Ссылка «‹ К играм» в левом верхнем углу — выход в каталог WinGo. */

  /** Выход в каталог: событие мосту (реальный WebView вернётся к списку), а в вебе — переход на хаб. */
  private exitToCatalog() {
    const session = this.registry.get('session') as Session | undefined;
    session?.exit();
    if (this.registry.get('demo')) {
      window.location.href = (this.registry.get('catalogUrl') as string) || HUB_URL;
    }
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

  /** «Как играть» — интерактивное обучение на настоящей сетке 4×4; по концу → обратно в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('locale', this.locale);
    this.registry.set('level', 'easy4'); // на 4×4 правила нагляднее
    this.scene.start('Game');
  }
}
