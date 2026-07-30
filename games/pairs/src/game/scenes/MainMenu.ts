import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, makeTopBar, makeGlyph } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import type { LevelId } from '../../core/deck';
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
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());

    // Пара одинаковых значков — механика игры одним взглядом.
    makeGlyph(this, CX - 24, 92, 'ball', 38);
    makeGlyph(this, CX + 24, 92, 'ball', 38);
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
    const levels: LevelId[] = ['easy', 'medium', 'hard'];
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

  /** «Как играть» — интерактивное обучение поверх настоящего поля; по концу → в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('locale', this.locale);
    this.registry.set('level', 'easy');
    this.scene.start('Game');
  }
}
