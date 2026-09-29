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
  makeChallengeList,
  type ChallengeRowState,
  setBackHandler,
} from '../ui';
import { COLORS } from '../palette';
import { CHALLENGES, CHALLENGES_TOTAL } from '../../core/challenges';
import {
  challengeStates, loadBests,
} from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'stack';
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
    // Системный «назад» из меню — тот же выход в каталог, что и стрелка.
    setBackHandler(() => this.exitToCatalog());

    makeGameIcon(this, CX, 84, 56);

    // Личный рекорд — главная цифра игры без уровней.
    const bests = loadBests(SLUG);
    makeRecordBadge(this, CX, 138, {
      value: String(Math.round(bests.score ?? 0)),
      label: t(this.locale, 'menu.record'),
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
    const list = makeChallengeList(this, CX, 196, {
      header: t(this.locale, 'menu.challenges', { k: doneCount, n: CHALLENGES_TOTAL }),
      rows,
    });

    const belowList = 196 + list.height + 34;
    makeButton(this, CX, belowList, t(this.locale, 'menu.play'), () => this.startRun(), {
      primary: true,
    });
    // «Как играть» и звук живут в паузе забега — меню короче на два ряда.
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
}
