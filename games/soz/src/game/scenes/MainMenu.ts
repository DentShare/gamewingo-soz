import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, type Button } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { loadDaily, setHighContrast } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
/** Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост. */
const HUB_URL = 'https://gamewingo-hub.vercel.app';

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

    this.buildCatalogLink();

    this.add
      .text(CX, 96, t(this.locale, 'app.title'), {
        fontFamily: FONT, fontSize: 44, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Выбор языка — две пилюли.
    this.langPill(CX - 78, 168, 'ru', 'Русский');
    this.langPill(CX + 78, 168, 'uz', 'Oʻzbekcha');

    // Разгадано ли сегодняшнее слово дня.
    const dayId = (this.registry.get('dayId') as number) ?? 0;
    const savedDaily = loadDaily(this.locale, dayId);
    const dailyDone = !!savedDaily && savedDaily.status !== 'in_progress';

    // Слово дня. Если уже разгадано — помечаем галочкой, а «Тренировка» становится главной CTA.
    const dailyLabel = dailyDone
      ? `${t(this.locale, 'menu.daily')}  ✓`
      : t(this.locale, 'menu.daily');
    makeButton(this, CX, 292, dailyLabel, () => this.startMode('daily'), { primary: !dailyDone });
    makeButton(this, CX, 358, t(this.locale, 'menu.practice'), () => this.startMode('practice'), { primary: dailyDone });
    makeButton(this, CX, 424, t(this.locale, 'menu.howto'), () => this.showHowto());

    if (dailyDone) {
      this.add
        .text(CX, 466, t(this.locale, 'menu.dailyDone'), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    const label = () =>
      `${t(this.locale, 'a11y.highContrast')}: ${this.registry.get('highContrast') ? '✓' : '×'}`;
    let btn: Button;
    btn = makeButton(this, CX, 556, label(), () => {
      const next = !this.registry.get('highContrast');
      this.registry.set('highContrast', next);
      setHighContrast(next);
      btn.setLabel(label());
    });
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    const selected = this.locale === loc;
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 148, height: 44, primary: selected });
  }

  private startMode(mode: 'daily' | 'practice') {
    this.registry.set('mode', mode);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Ссылка «‹ К играм» слева вверху — выход в каталог игр WinGo. */
  private buildCatalogLink() {
    const link = this.add
      .text(16, 32, `‹ ${t(this.locale, 'menu.catalog')}`, {
        fontFamily: FONT, fontSize: 15, color: '#d34e12', fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setResolution(DPR)
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

  /** «Как играть» — запускает интерактивное обучение поверх игрового поля; по концу → в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('mode', 'practice');
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }
}
