import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, darken, setupCamera, makeTopBar } from '../ui';
import { COLORS, FONT, tileColor, tileTextColor } from '../palette';
import { DPR } from '../dpr';
import { loadBest, loadSave, clearSave } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /2048/, хаб — на корне того же домена,
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
    this.buildLogo(t(this.locale, 'app.title'));

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 220, 'ru', 'Русский');
    this.langPill(CX + 78, 220, 'uz', 'Oʻzbekcha');

    // Незаконченная партия → «Продолжить» + «Начать заново», иначе одна «Играть».
    const saved = loadSave();
    let bestY = 368;
    let howtoY = 430;
    if (saved) {
      makeButton(
        this, CX, 304, `${t(this.locale, 'menu.continue')} · ${saved.score}`,
        () => this.startGame(true), { primary: true, width: 248, height: 56 },
      );
      makeButton(this, CX, 374, t(this.locale, 'menu.restart'), () => this.startGame(false), {
        width: 248, height: 52,
      });
      bestY = 416;
      howtoY = 478;
    } else {
      makeButton(this, CX, 328, t(this.locale, 'menu.play'), () => this.startGame(false), {
        primary: true, width: 248, height: 56,
      });
    }

    const best = loadBest();
    if (best > 0) {
      this.add
        .text(CX, bestY, t(this.locale, 'menu.best', { n: best }), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    makeButton(this, CX, howtoY, t(this.locale, 'menu.howto'), () => this.showHowto());
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
      const cont = this.add.container(x, 128).setScale(0);
      const g = this.add.graphics();
      g.fillStyle(darken(tileColor(v), 0.18), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, 14);
      g.fillStyle(tileColor(v), 1).fillRoundedRect(-size / 2, -size / 2, size, size, 14);
      const txt = this.add
        .text(0, 0, ch, { fontFamily: FONT, fontSize: 30, color: tileTextColor(v), fontStyle: 'bold' })
        .setOrigin(0.5)
        .setResolution(DPR);
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

  /** `resume` — продолжить сохранённую партию; иначе стартует новая (сохранение стирается). */
  private startGame(resume: boolean) {
    if (!resume) clearSave();
    this.registry.set('resume', resume);
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
