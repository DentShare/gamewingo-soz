import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton,
  makeTopBar,
  applyTheme,
  setupCamera,
  makeNextLevelCard,
  makeChapterSection,
  type LevelTileState,
  setBackHandler,
  readBonusBalance,
  playSound,
  C, S, TYPE, WEIGHT, RADIUS, BUTTON_H, TOP_BAR_H, LOGICAL_W, VIEW_TOP, VIEW_BOTTOM,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { loadDaily, setHighContrast } from '../../core/persistence';
import { formatClock } from '../roundTimer';
import { LADDER, LADDER_SIZE, levelAt, newLever } from '../../core/levels';
import {
  chapterOf, chapterStates, isLadderComplete, loadProgress, nextLevel, totalStars, TARIFF,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'soz';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

/** Названия глав — по рычагу, который в ней появляется. */
const CHAPTER_TITLES = ['chapter.1', 'chapter.2', 'chapter.3'] as const;

/**
 * Меню: сверху «Слово дня» — главный ежедневный повод зайти; под ним тренировка
 * по главам, как у остальных лестниц каталога (макет 1c аудита): карточка
 * «Следующий» с новым рычагом и порогом трёх звёзд, развёрнутая глава, остальные
 * строкой. Раньше тут была сетка из 15 плиток с замками.
 */
export class MainMenu extends Scene {
  private locale: Locale = 'ru';
  /** Какая глава развёрнута; по умолчанию — та, где следующий уровень. */
  private shownChapter = 0;

  constructor() {
    super('MainMenu');
  }

  init(data: { chapter?: number }) {
    this.shownChapter = data?.chapter ?? 0;
  }

  create() {
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    applyTheme(this);
    setupCamera(this);
    // Переключение главы перерисовывает меню — без затемнения, иначе экран мигает.
    if (!this.shownChapter) this.cameras.main.fadeIn(200, ...COLORS.fade);

    makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());
    // Системный «назад» из меню — тот же выход в каталог, что и стрелка.
    setBackHandler(() => this.exitToCatalog());

    // Слово дня — отдельный режим со своей наградой, он не входит в лестницу.
    const dayId = (this.registry.get('dayId') as number) ?? 0;
    const savedDaily = loadDaily(this.locale, dayId);
    const dailyDone = !!savedDaily && savedDaily.status !== 'in_progress';
    const dailyLabel = dailyDone
      ? `${t(this.locale, 'menu.daily')}  ✓`
      : t(this.locale, 'menu.daily');
    makeButton(this, CX, 92, dailyLabel, () => this.startDaily(), { primary: !dailyDone });

    const progress = loadProgress(SLUG);
    const complete = isLadderComplete(progress, LADDER_SIZE);
    // Вся лестница пройдена — предлагаем первый уровень, где не хватает звёзд.
    const improveAt = LADDER.find((lv) => (progress.stars[lv.n - 1] ?? 0) < 3)?.n;
    const next = complete ? improveAt ?? LADDER_SIZE : nextLevel(progress, LADDER_SIZE);

    let y = 92 + BUTTON_H.md / 2 + 16;
    const lever = newLever(next);
    const card = makeNextLevelCard(this, CX, y, {
      locale: this.locale,
      n: next,
      stars: totalStars(progress),
      maxStars: LADDER_SIZE * 3,
      field: this.guessesLabel(levelAt(next).params.guesses),
      intro: lever ? this.leverLabel(next, lever) : undefined,
      goldHint: t(this.locale, 'level.goldHint', { n: levelAt(next).goals.gold }),
      improve: complete,
      onPlay: () => this.startLevel(next),
    });
    y += card.height + 20;

    // Главы: развёрнутая первой, остальные строкой — по порядку.
    const chapters = chapterStates(progress, LADDER_SIZE);
    const shown = this.shownChapter || chapterOf(next);
    const ordered = [chapters[shown - 1], ...chapters.filter((c) => c.n !== shown)];
    for (const ch of ordered) {
      const expanded = ch.n === shown;
      const tiles: LevelTileState[] = ch.levels.map((n) => ({
        n,
        unlocked: n <= next || (progress.stars[n - 1] ?? 0) > 0,
        stars: progress.stars[n - 1] ?? 0,
        current: n === next && !complete,
      }));
      const section = makeChapterSection(this, CX, y, {
        locale: this.locale,
        n: ch.n,
        title: t(this.locale, CHAPTER_TITLES[ch.n - 1]),
        levels: tiles,
        cleared: ch.cleared,
        done: ch.done,
        unlocked: ch.unlocked,
        stars: ch.stars,
        maxStars: ch.maxStars,
        bonus: TARIFF.chapterClear,
        expanded,
        onPick: (n) => this.startLevel(n),
        onToggle: () => this.scene.restart({ chapter: ch.n }),
      });
      y += section.height + (expanded ? 20 : 14);
    }
    // «Как играть» и звук живут в паузе партии, высокий контраст — под шестерёнкой.
    this.makeGear();
  }

  /* ── Настройки ─────────────────────────────────────────────────────────── */

  /**
   * Шестерёнка в шапке, слева от счётчика бонусов. Раньше «Высокий контраст: ×»
   * был полноразмерной кнопкой меню — настройка на один раз не должна спорить
   * с «Играть» за первый экран.
   */
  private makeGear() {
    // Чип бонусов рисует шапка (`makeTopBar`); его ширина — от баланса: тот же расчёт.
    const probe = this.add.text(0, 0, String(readBonusBalance()), { fontFamily: FONT, fontSize: 14, fontStyle: WEIGHT.semibold });
    const chipW = 10 + 16 + 5 + probe.width + 11;
    probe.destroy();
    const x = LOGICAL_W - 14 - chipW - 26;
    const y = TOP_BAR_H / 2;
    const g = this.add.graphics();
    const pts: Array<{ x: number; y: number }> = [];
    const TEETH = 8;
    for (let i = 0; i < TEETH * 4; i++) {
      // Зубец: две точки на внешнем радиусе, две — на внутреннем.
      const r = Math.floor(i / 2) % 2 === 0 ? 10 : 7.5;
      const a = ((i - 0.5) / (TEETH * 4)) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    g.lineStyle(2, C.white, 1).beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.strokePath();
    g.strokeCircle(x, y, 3.5);
    const hit = this.add.rectangle(x, y, 44, 44, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => playSound('tap'));
    hit.on('pointerup', () => this.openSettings());
  }

  /** Шит настроек: пока одна строка — высокий контраст с переключателем. */
  private openSettings() {
    const loc = this.locale;
    const root = this.add.container(0, 0).setDepth(1000);
    const W = LOGICAL_W;
    const dim = this.add
      .rectangle(W / 2, (VIEW_TOP + VIEW_BOTTOM) / 2, W, VIEW_BOTTOM - VIEW_TOP, C.ink, 0.5)
      .setInteractive();
    const PAD = 20;
    const SW_W = 44;
    const SW_H = 26;
    const swX = W - PAD - 16 - SW_W;
    const textW = swX - (PAD + 16) - 12;
    // Тексты строки создаются первыми: высота шита — по пояснению (узбекское длиннее).
    const label = this.add
      .text(PAD + 16, 0, t(loc, 'a11y.highContrast'), {
        fontFamily: FONT, fontSize: TYPE.body, fontStyle: WEIGHT.semibold, color: S.ink,
      })
      .setResolution(DPR);
    const hint = this.add
      .text(PAD + 16, 0, t(loc, 'settings.contrastHint'), {
        fontFamily: FONT, fontSize: TYPE.caption, color: S.muted,
      })
      .setWordWrapWidth(textW, true)
      .setResolution(DPR);
    const ROW_H = Math.max(72, 14 + label.height + 4 + hint.height + 14);
    const H = 20 + 26 + 20 + ROW_H + 20 + BUTTON_H.lg + 28;
    const top = VIEW_BOTTOM - H;
    const sheet = this.add.graphics();
    sheet.fillStyle(C.bg, 1).fillRoundedRect(0, top, W, H + 20, { tl: 20, tr: 20, bl: 0, br: 0 });
    sheet.fillStyle(C.divider, 1).fillRoundedRect(W / 2 - 18, top + 8, 36, 4, 2);
    const sheetHit = this.add.rectangle(W / 2, top + H / 2, W, H, 0x000000, 0).setInteractive();
    const title = this.add
      .text(W / 2, top + 33, t(loc, 'settings.title'), {
        fontFamily: FONT, fontSize: TYPE.title, fontStyle: WEIGHT.bold, color: S.ink,
      })
      .setOrigin(0.5)
      .setResolution(DPR);

    // Строка настройки — вся тап-цель: подпись, пояснение и переключатель справа.
    const rowY = top + 66;
    const card = this.add.graphics();
    card.fillStyle(C.surface, 1).fillRoundedRect(PAD, rowY, W - PAD * 2, ROW_H, RADIUS.card);
    card.lineStyle(1, C.divider, 1).strokeRoundedRect(PAD, rowY, W - PAD * 2, ROW_H, RADIUS.card);
    label.setY(rowY + 14);
    hint.setY(rowY + 14 + label.height + 4);
    const swY = rowY + ROW_H / 2 - SW_H / 2;
    const sw = this.add.graphics();
    const paintSwitch = () => {
      const on = !!this.registry.get('highContrast');
      sw.clear();
      sw.fillStyle(on ? C.primary : C.divider, 1).fillRoundedRect(swX, swY, SW_W, SW_H, SW_H / 2);
      sw.fillStyle(C.white, 1).fillCircle(on ? swX + SW_W - SW_H / 2 : swX + SW_H / 2, swY + SW_H / 2, SW_H / 2 - 3);
    };
    paintSwitch();
    const rowHit = this.add
      .rectangle(W / 2, rowY + ROW_H / 2, W - PAD * 2, ROW_H, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    rowHit.on('pointerdown', () => playSound('tap'));
    rowHit.on('pointerup', () => {
      const on = !this.registry.get('highContrast');
      this.registry.set('highContrast', on);
      setHighContrast(on);
      paintSwitch();
    });

    const close = () => {
      if (!root.active) return;
      root.destroy();
      setBackHandler(() => this.exitToCatalog());
    };
    const done = makeButton(this, W / 2, rowY + ROW_H + 20 + BUTTON_H.lg / 2, t(loc, 'settings.done'), close, {
      primary: true, width: W - PAD * 2, height: BUTTON_H.lg,
    });
    const panel = this.add.container(0, H, [sheet, sheetHit, title, card, label, hint, sw, rowHit, done.root]);
    root.add([dim, panel]);
    // Тап мимо шита и системный «назад» — закрыть шит, а не выйти из игры.
    dim.on('pointerup', close);
    setBackHandler(close);
    dim.setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 160 });
    this.tweens.add({ targets: panel, y: 0, duration: 220, ease: 'Cubic.easeOut' });
  }

  /** Что нового на уровне: «строгий режим», «редкие слова», «таймер 5:00», «5 попыток». */
  private leverLabel(n: number, lever: string): string {
    const p = levelAt(n).params;
    if (lever === 'strict') return t(this.locale, 'menu.strict').toLowerCase();
    if (lever === 'rare') return t(this.locale, 'menu.rare');
    if (lever === 'timeLimitSec') return t(this.locale, 'menu.timer', { t: formatClock(p.timeLimitSec) });
    return this.guessesLabel(p.guesses);
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
}
