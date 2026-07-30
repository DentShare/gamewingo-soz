import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton, makeTopBar, applyTheme, setupCamera, type Button, makeLevelGrid, makeLadderSummary,
  type LevelTileState,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { loadDaily, setHighContrast } from '../../core/persistence';
import { LADDER, LADDER_SIZE } from '../../core/levels';
import { isUnlocked, loadProgress, nextLevel, totalStars } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'soz';
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

    // Слово дня — отдельный режим со своей наградой, он не входит в лестницу.
    const dayId = (this.registry.get('dayId') as number) ?? 0;
    const savedDaily = loadDaily(this.locale, dayId);
    const dailyDone = !!savedDaily && savedDaily.status !== 'in_progress';
    const dailyLabel = dailyDone
      ? `${t(this.locale, 'menu.daily')}  ✓`
      : t(this.locale, 'menu.daily');
    makeButton(this, CX, 92, dailyLabel, () => this.startDaily(), { primary: !dailyDone });

    const progress = loadProgress(SLUG);
    const next = nextLevel(progress, LADDER_SIZE);

    makeLadderSummary(
      this,
      CX,
      146,
      t(this.locale, 'menu.ladder', { n: next, total: LADDER_SIZE }),
      totalStars(progress),
      LADDER_SIZE * 3,
    );

    // Лестница тренировки: пройденные со звёздами, следующий выделен, дальше — замки.
    const tiles: LevelTileState[] = LADDER.map((lv) => ({
      n: lv.n,
      unlocked: isUnlocked(progress, lv.n),
      stars: progress.stars[lv.n - 1] ?? 0,
      current: lv.n === next,
    }));
    const grid = makeLevelGrid(this, CX, 190, tiles, (n) => this.startLevel(n));

    // Подпись к следующему уровню: чем именно он отличается.
    this.add
      .text(CX, 190 + grid.height + 14, this.levelRules(next), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    const belowGrid = 190 + grid.height + 44;
    makeButton(this, CX, belowGrid, t(this.locale, 'menu.play', { n: next }), () => this.startLevel(next), {
      primary: dailyDone,
    });
    makeButton(this, CX, belowGrid + 52, t(this.locale, 'menu.howto'), () => this.showHowto());

    const label = () =>
      `${t(this.locale, 'a11y.highContrast')}: ${this.registry.get('highContrast') ? '✓' : '×'}`;
    let btn: Button;
    btn = makeButton(this, CX, belowGrid + 104, label(), () => {
      const on = !this.registry.get('highContrast');
      this.registry.set('highContrast', on);
      setHighContrast(on);
      btn.setLabel(label());
    });

    // Выбор языка — две пилюли.
    this.langPill(CX - 92, belowGrid + 156, 'ru', 'Русский');
    this.langPill(CX + 92, belowGrid + 156, 'uz', 'Oʻzbekcha');
  }

  /** Строка «6 попыток · строгий режим · без подсветки» — что именно ждёт на уровне. */
  private levelRules(n: number): string {
    const p = LADDER[n - 1].params;
    const parts = [this.guessesLabel(p.guesses)];
    if (p.strict) parts.push(t(this.locale, 'menu.strict'));
    if (!p.keyboardHints) parts.push(t(this.locale, 'menu.noHints'));
    return parts.join(' · ');
  }

  /** «4 попытки» / «5 попыток» — русский требует согласования числительного. */
  private guessesLabel(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    let key = 'menu.guessesMany';
    if (mod10 === 1 && mod100 !== 11) key = 'menu.guessesOne';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) key = 'menu.guessesFew';
    return t(this.locale, key, { n });
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

  private startDaily() {
    this.registry.set('mode', 'daily');
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  private startLevel(n: number) {
    this.registry.set('mode', 'practice');
    this.registry.set('level', n);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
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
    this.registry.set('level', 1);
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }
}
