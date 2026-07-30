import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, makeTopBar, applyTheme, setupCamera, type Button, makeGameIcon } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { loadDaily, setHighContrast } from '../../core/persistence';
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

    this.buildHeader();

    // Выбор языка — две пилюли.
    this.langPill(CX - 92, 208, 'ru', 'Русский');
    this.langPill(CX + 92, 208, 'uz', 'Oʻzbekcha');

    // Разгадано ли сегодняшнее слово дня.
    const dayId = (this.registry.get('dayId') as number) ?? 0;
    const savedDaily = loadDaily(this.locale, dayId);
    const dailyDone = !!savedDaily && savedDaily.status !== 'in_progress';

    // Слово дня. Если уже разгадано — помечаем галочкой, а «Тренировка» становится главной CTA.
    const dailyLabel = dailyDone
      ? `${t(this.locale, 'menu.daily')}  ✓`
      : t(this.locale, 'menu.daily');
    makeButton(this, CX, 318, dailyLabel, () => this.startMode('daily'), { primary: !dailyDone });
    makeButton(this, CX, 384, t(this.locale, 'menu.practice'), () => this.startMode('practice'), { primary: dailyDone });
    makeButton(this, CX, 450, t(this.locale, 'menu.howto'), () => this.showHowto());

    if (dailyDone) {
      this.add
        .text(CX, 492, t(this.locale, 'menu.dailyDone'), {
          fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
    }

    const label = () =>
      `${t(this.locale, 'a11y.highContrast')}: ${this.registry.get('highContrast') ? '✓' : '×'}`;
    let btn: Button;
    btn = makeButton(this, CX, 574, label(), () => {
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
    }, { width: 176, height: 40, primary: selected });
  }

  private startMode(mode: 'daily' | 'practice') {
    this.registry.set('mode', mode);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  /** Шапка каталога, иконка игры и короткая подпись. */
  private buildHeader() {
    makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());

    // Заголовок уже в шапке — здесь иконка каталога и подпись под ней.
    makeGameIcon(this, CX, 110, 92);
    this.add
      .text(CX, 172, t(this.locale, 'app.subtitle'), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);
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
