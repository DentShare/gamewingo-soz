import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton,
  applyTheme,
  setupCamera,
  makeTopBar,
  makeGameIcon,
  makeRecordBadge,
  makeMilestoneBar,
  makeChallengeList,
  type ChallengeRowState,
  makeSoundToggle,
  rememberLocale,
} from '../ui';
import { COLORS } from '../palette';
import { CHALLENGES, CHALLENGES_TOTAL, MILESTONES } from '../../core/challenges';
import {
  challengeStates, milestoneStates, nextMilestone, loadBests,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'flyer';
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

    makeGameIcon(this, CX, 84, 56);

    // Личный рекорд — главная цифра игры без уровней.
    const bests = loadBests(SLUG);
    makeRecordBadge(this, CX, 138, {
      value: String(Math.round(bests.score ?? 0)),
      label: t(this.locale, 'menu.record'),
    });

    // Полоса до следующей вехи по проёмам.
    const miles = milestoneStates(SLUG, MILESTONES);
    const next = nextMilestone(miles);
    makeMilestoneBar(this, CX, 196, {
      label: next
        ? t(this.locale, 'menu.nextMilestone', { n: next.target, r: next.reward })
        : t(this.locale, 'menu.milestonesDone'),
      value: next ? Math.round(bests.passed ?? 0) : 1,
      target: next ? next.target : 1,
    });

    // Испытания: выполненные, активное и пара следующих.
    const states = challengeStates(SLUG, CHALLENGES);
    const doneCount = states.filter((s) => s.done).length;
    const rows: ChallengeRowState[] = states.map((s) => ({
      n: s.n,
      text: t(this.locale, `challenge.${s.id}`),
      done: s.done,
      active: s.active,
    }));
    const list = makeChallengeList(this, CX, 226, {
      header: t(this.locale, 'menu.challenges', { k: doneCount, n: CHALLENGES_TOTAL }),
      rows,
    });

    const belowList = 226 + list.height + 34;
    makeButton(this, CX, belowList, t(this.locale, 'menu.play'), () => this.startRun(), {
      primary: true,
    });
    makeButton(this, CX, belowList + 52, t(this.locale, 'menu.howto'), () => this.showHowto());

    // Выбор языка — две пилюли под кнопками.
    this.langPill(CX - 92, belowList + 108, 'ru', 'Русский');
    this.langPill(CX + 92, belowList + 108, 'uz', 'Oʻzbekcha');

    // Звук: беззвучный режим общий для каталога, поэтому виджет из дизайн-системы.
    makeSoundToggle(this, CX, belowList + 108 + 44, {
      on: t(this.locale, 'sound.on'),
      off: t(this.locale, 'sound.off'),
    });
  }

  /** Пилюля выбора языка. Выбранная подсвечена; по тапу переключает и перерисовывает меню. */
  private langPill(x: number, y: number, loc: Locale, label: string) {
    return makeButton(this, x, y, label, () => {
      if (this.locale === loc) return;
      rememberLocale(loc); // общий выбор каталога: хаб и другие игры
      this.registry.set('locale', loc);
      this.scene.restart();
    }, { width: 176, height: 40, primary: this.locale === loc });
  }

  private startRun() {
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
    this.registry.set('locale', this.locale);
    this.scene.start('Game');
  }
}
