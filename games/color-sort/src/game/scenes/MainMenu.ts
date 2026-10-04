import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  makeButton,
  applyTheme,
  setupCamera,
  makeTopBar,
  makeGameIcon,
  makeCard, makeKeyCap, makeStarRow, toast, guardBrowserBack, createGameHeader, C, S, FONT,
} from '../ui';
import { COLORS } from '../palette';
import { CHAPTERS, levelAt, LADDER_SIZE } from '../../core/levels';
import { DPR } from '../dpr';
import { levelIntro } from '../presentation';
import { isUnlocked, loadProgress, nextLevel, totalStars } from '@gamewingo/game-progress';
import type { Session } from '../../bridge/session';

const CX = 200;
const SLUG = 'color-sort';
/**
 * Каталог игр WinGo (для автономного/веб-режима). В приложении выход обрабатывает мост.
 * Путь относительный: игра лежит на /<slug>/, хаб — на корне того же домена,
 * поэтому ссылка не зависит от того, на каком домене развёрнут каталог.
 */
const HUB_URL = '../';

export class MainMenu extends Scene {
  private locale: Locale = 'ru';
  private expanded = new Set<number>();

  constructor() {
    super('MainMenu');
  }

  create() {
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);

    if (this.registry.get('demo')) makeTopBar(this, t(this.locale, 'app.title'), () => this.exitToCatalog());
    else createGameHeader(this, { title: t(this.locale, 'app.title'), chips: [], onBack: () => this.exitToCatalog() });

    const progress = loadProgress(SLUG);
    const next = nextLevel(progress, LADDER_SIZE);
    const level = levelAt(next);
    makeCard(this, 20, 82, 360, 190);
    makeGameIcon(this, 340, 122, 48);
    this.text(32, 101, t(this.locale, 'menu.next'), 12, S.muted);
    this.text(32, 125, t(this.locale, 'game.level', { n: next }), 20);
    this.text(32, 157, levelIntro(this.locale, next), 13);
    this.text(32, 180, t(this.locale, 'menu.parameters', { tubes: level.tubes.length, colors: level.colors }), 12, S.muted);
    this.text(32, 204, t(this.locale, level.goldHint ?? 'menu.goldHint', { n: level.goals.gold }), 12, S.gold);
    makeButton(this, CX, 242, t(this.locale, 'menu.start'), () => this.startLevel(next), { primary: true, height: 44 });
    let top = 288;
    for (const chapter of CHAPTERS) {
      const cleared = chapter.levels.every((n) => (progress.stars[n - 1] ?? 0) > 0);
      const expanded = !cleared || this.expanded.has(chapter.n);
      const height = expanded ? 130 : 54;
      const stars = chapter.levels.reduce((sum, n) => sum + (progress.stars[n - 1] ?? 0), 0);
      const done = chapter.levels.filter((n) => (progress.stars[n - 1] ?? 0) > 0).length;
      makeCard(this, 20, top, 360, height);
      if (cleared) {
        const toggle = this.add.rectangle(CX, top + 27, 360, 48, C.white, 0).setInteractive({ useHandCursor: true });
        toggle.on('pointerup', () => { if (expanded) this.expanded.delete(chapter.n); else this.expanded.add(chapter.n); this.scene.restart(); });
      }
      this.text(32, top + 25, t(this.locale, 'menu.chapter', { n: chapter.n, title: t(this.locale, chapter.title) }), 15);
      this.text(368, top + 48, t(this.locale, cleared ? 'menu.chapterCleared' : 'menu.chapterProgress', { done, stars }), 12, cleared ? S.success : S.muted).setOrigin(1, 0.5);
      if (expanded) chapter.levels.forEach((n, index) => {
        const unlocked = isUnlocked(progress, n);
        const tile = makeKeyCap(this, 56 + index * 72, top + 88, 60, 60, String(n), () => {
          if (unlocked || this.registry.get('preview')) this.startLevel(n);
          else toast(this, CX, 630, t(this.locale, 'menu.locked'));
        }, { fontSize: 18 });
        if (n === next) tile.setFill(C.primary, S.white);
        else if (!unlocked) tile.root.setAlpha(0.45);
        tile.root.add(makeStarRow(this, 0, 19, progress.stars[n - 1] ?? 0, 6, { color: n === next ? C.white : C.divider, alpha: n === next ? 0.4 : 1 }));
      });
      top += height + 14;
    }
    this.text(CX, top + 8, `★ ${totalStars(progress)} / ${LADDER_SIZE * 3}`, 12, S.gold).setOrigin(0.5);
    const off = guardBrowserBack(() => this.exitToCatalog(), false);
    this.events.once('shutdown', off);
  }

  private startLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('howto', false);
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

  private text(x: number, y: number, label: string, size: number, color = S.ink) {
    return this.add.text(x, y, label, { fontFamily: FONT, fontSize: size, color, fontStyle: size >= 15 ? '600' : '400' }).setOrigin(0, 0.5).setResolution(DPR);
  }
}
