import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton, applyTheme, darken, setupCamera, makeTopBar, makeLevelGrid, makeLadderSummary,
  type LevelTileState,
} from '../ui';
import { LADDER, LADDER_SIZE, levelAt } from '../../core/levels';
import { isUnlocked, loadProgress, nextLevel, totalStars } from '@gamewingo/game-progress';
import { COLORS, FONT, tileColor, tileTextColor } from '../palette';
import { DPR } from '../dpr';
import { loadSave, clearSave } from '../../core/persistence';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = '2048';
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

    const progress = loadProgress(SLUG);
    const next = nextLevel(progress, LADDER_SIZE);

    makeLadderSummary(
      this,
      CX,
      196,
      t(this.locale, 'menu.ladder', { n: next, total: LADDER_SIZE }),
      totalStars(progress),
      LADDER_SIZE * 3,
    );

    // Лестница целей: уровень пройден, когда собрана заданная плитка.
    const tiles: LevelTileState[] = LADDER.map((lv) => ({
      n: lv.n,
      unlocked: isUnlocked(progress, lv.n),
      stars: progress.stars[lv.n - 1] ?? 0,
      current: lv.n === next,
    }));
    const grid = makeLevelGrid(this, CX, 238, tiles, (n) => this.startLevel(n));

    this.add
      .text(CX, 238 + grid.height + 14, t(this.locale, 'menu.goalTile', { tile: levelAt(next).params.targetTile }), {
        fontFamily: FONT, fontSize: 13, color: COLORS.headMuted,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Незаконченная партия — отдельной кнопкой над лестницей.
    let y = 238 + grid.height + 44;
    const saved = loadSave();
    if (saved) {
      makeButton(this, CX, y, `${t(this.locale, 'menu.continue')} · ${saved.score}`,
        () => this.startGame(true), { primary: true });
      y += 52;
    }
    makeButton(this, CX, y, t(this.locale, 'menu.play', { n: next }), () => this.startLevel(next), {
      primary: !saved,
    });
    y += 52;
    makeButton(this, CX, y, t(this.locale, 'menu.howto'), () => this.showHowto());

    // Выбор языка — две пилюли под кнопками.
    this.langPill(CX - 92, y + 56, 'ru', 'Русский');
    this.langPill(CX + 92, y + 56, 'uz', 'Oʻzbekcha');

  }

  private startLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('locale', this.locale);
    clearSave();
    this.registry.set('resume', false);
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
    }, { width: 176, height: 40, primary: this.locale === loc });
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
