import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton,
  applyTheme,
  setupCamera,
  makeTopBar,
  makeSoundToggle,
  makeNextLevelCard,
  makeChapterSection,
  makeDailyLevelCard,
  pluralForm,
  TOP_BAR_H,
  type LevelTileState,
} from '../ui';
import { COLORS } from '../palette';
import { CHAPTER_TITLES, LADDER, LADDER_SIZE, levelInfo, type Phrase } from '../../core/levels';
import {
  chapterOf,
  chapterStates,
  dailyLevelFor,
  DAILY_LEVEL,
  isDailyLevelDone,
  isDailyLevelUnlocked,
  isLadderComplete,
  loadProgress,
  nextLevel,
  totalStars,
  TARIFF,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'sudoku-kids';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

/**
 * Меню по главам (макет 1c аудита): сверху «Следующий» — номер, новый рычаг и
 * порог трёх звёзд; под ним развёрнутая глава, остальные свёрнуты в строку;
 * внизу «Уровень дня».
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

    const progress = loadProgress(SLUG);
    const complete = isLadderComplete(progress, LADDER_SIZE);
    // Вся лестница пройдена — предлагаем первый уровень, где не хватает звёзд.
    const improveAt = LADDER.find((lv) => (progress.stars[lv.n - 1] ?? 0) < 3)?.n;
    const next = complete ? improveAt ?? LADDER_SIZE : nextLevel(progress, LADDER_SIZE);
    const info = levelInfo(next);

    let y = TOP_BAR_H + 16;
    const card = makeNextLevelCard(this, CX, y, {
      locale: this.locale,
      n: next,
      stars: totalStars(progress),
      maxStars: LADDER_SIZE * 3,
      field: this.phrase(info.field, true),
      intro: info.intro ? this.phrase(info.intro) : undefined,
      goldHint: this.phrase(info.goldHint),
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

    // Уровень дня: тот же генератор, расклад по дате — один на всех игроков.
    y += 2;
    const dailyState = !isDailyLevelUnlocked(progress) ? 'locked' : isDailyLevelDone(SLUG) ? 'done' : 'ready';
    const daily = makeDailyLevelCard(this, CX, y, {
      locale: this.locale,
      state: dailyState,
      bonus: TARIFF.levelOfDay,
      unlockAfter: DAILY_LEVEL.unlockAfter,
      onPlay: () => this.startDaily(),
    });
    y += daily.height + 20 + 20; // + половина высоты кнопки: её y — центр

    // «Как играть» и звук переедут в паузу вместе с новой шапкой партии (T3).
    makeButton(this, CX, y, t(this.locale, 'menu.howto'), () => this.showHowto());
    makeSoundToggle(this, CX, y + 50, {
      on: t(this.locale, 'sound.on'),
      off: t(this.locale, 'sound.off'),
    });
  }

  /** Фраза из core → строка на языке игрока; `counted` — ключ с формой числа. */
  private phrase(p: Phrase, counted = false): string {
    const key = counted ? `${p.key}.${pluralForm(Number(p.vars.n))}` : p.key;
    return t(this.locale, key, p.vars);
  }

  private startLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('mode', 'level');
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }

  private startDaily() {
    const daily = dailyLevelFor(SLUG);
    this.registry.set('level', daily.n);
    this.registry.set('mode', 'dailyLevel');
    this.registry.set('dailySeed', daily.seed);
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

  /** «Как играть» — интерактивное обучение поверх настоящего поля; по концу → в меню. */
  private showHowto() {
    this.registry.set('howto', true);
    this.registry.set('mode', 'level');
    this.registry.set('locale', this.locale);
    this.registry.set('level', 1);
    this.scene.start('Game');
  }
}
