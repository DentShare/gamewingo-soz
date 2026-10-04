import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { makeButton, makeCard, applyTheme, setupCamera, makeStarRow, playSound, makePhoenix, createGameHeader, guardBrowserBack, S, C, FONT } from '../ui';
import { COLORS } from '../palette';
import { DPR } from '../dpr';
import { computeScore } from '../../core/score';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import { recordLevelResult, starsFor, starGap, loadProgress, isUnlocked, dailyMissions, grantRoundBonuses } from '@gamewingo/game-progress';
import { activeTime, levelIntro } from '../presentation';
import { confirmedReward } from '../rewardView';
import confetti from 'canvas-confetti';

interface LastGame { level: number; locale: Locale; moves: number; par: number; durationMs: number; }
const CX = 200;
const SLUG = 'color-sort';

export class GameOver extends Scene {
  constructor() { super('GameOver'); }
  create() {
    applyTheme(this); setupCamera(this); this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame | undefined;
    if (!last) { this.scene.start('MainMenu'); return; }
    const level = levelAt(last.level);
    const stars = starsFor(level.goals, last.moves);
    const preview = Boolean(this.registry.get('preview'));
    const demo = Boolean(this.registry.get('demo'));
    const missionsBefore = dailyMissions();
    // Предпросмотр вообще не изменяет прогресс. Реальные деньги не пишет клиент.
    const record = preview ? null : recordLevelResult({ slug: SLUG, n: last.level, stars, score: computeScore(last) });
    const bonus = demo && !preview ? grantRoundBonuses({ slug: SLUG, n: last.level, record, missionsBefore }) : null;
    const menu = () => this.scene.start('MainMenu');
    createGameHeader(this, { title: t(last.locale, 'app.title'), chips: [], onBack: menu });
    const offBack = guardBrowserBack(menu); this.events.once('shutdown', offBack);
    this.text(CX, 92, t(last.locale, 'result.chapter', { n: last.level, chapter: Math.ceil(last.level / 5) }), 15, S.muted);
    this.text(CX, 132, t(last.locale, 'result.title'), 30);
    makeStarRow(this, CX, 194, stars, 26);
    const phoenix = makePhoenix(this, 348, 198, 52, { facing: 'left' });
    this.time.delayedCall(320, () => phoenix.celebrate()); this.events.once('shutdown', () => phoenix.destroy());
    for (let i = 0; i < stars; i++) this.time.delayedCall(150 + i * 150, () => playSound('star'));
    const details = t(last.locale, 'result.details', { moves: last.moves, gold: level.goals.gold, time: activeTime(last.durationMs) });
    const gap = starGap(level, { metric: 'moves', value: last.moves });
    let bonusY = 274;
    if (gap) {
      makeCard(this, 20, 242, 360, 116);
      this.text(32, 265, t(last.locale, 'result.gap', { n: gap.missing }), 15).setOrigin(0, 0.5);
      this.text(32, 291, details, 12, S.muted).setOrigin(0, 0.5);
      makeButton(this, 302, 330, t(last.locale, 'result.playAgain'), () => this.play(last.level), { width: 132, height: 44, fontSize: 14 });
      bonusY = 374;
    } else this.text(CX, 247, details, 12, S.muted);
    makeCard(this, 20, bonusY, 360, 180);
    this.text(32, bonusY + 22, t(last.locale, 'result.bonuses'), 16).setOrigin(0, 0.5);
    const rows = this.add.container(0, 0);
    this.add.graphics().lineStyle(1, C.divider).lineBetween(32, bonusY + 132, 368, bonusY + 132);
    this.text(32, bonusY + 155, t(last.locale, 'result.granted'), 16).setOrigin(0, 0.5);
    const total = this.text(368, bonusY + 155, '—', 20, S.gold).setOrigin(1, 0.5);
    const status = (key: string, amount: number | null) => {
      rows.removeAll(true);
      rows.add(this.text(32, bonusY + 53, t(last.locale, key), 13, S.muted).setOrigin(0, 0.5));
      total.setText(amount === null ? '—' : `+${amount}`);
    };
    if (preview) status('result.preview', 0);
    else if (bonus) {
      if (!bonus.granted.length) status('result.noBonus', 0);
      else {
        bonus.granted.forEach((grant, index) => {
          const label = grant.key.startsWith('level-') ? t(last.locale, 'result.firstClear', { n: last.level }) : t(last.locale, 'result.mission');
          rows.add(this.text(32, bonusY + 52 + index * 20, label, 13).setOrigin(0, 0.5));
          rows.add(this.text(368, bonusY + 52 + index * 20, `+${grant.amount}`, 13, S.gold).setOrigin(1, 0.5));
        });
        total.setText(`+${bonus.total}`);
      }
    } else {
      status('result.pending', null);
      const promise = this.registry.get('rewardPromise') as Promise<{ accepted: boolean; pointsAwarded?: number } | null> | null;
      let active = true;
      this.events.once('shutdown', () => { active = false; });
      void Promise.resolve(promise).then((result) => {
        if (!active) return;
        const amount = confirmedReward(result);
        status(amount === null ? 'result.notAccepted' : 'result.server', amount);
      }).catch(() => { if (active) status('result.notAccepted', null); });
    }
    const next = last.level + 1;
    const hasNext = next <= LADDER_SIZE && (preview || isUnlocked(loadProgress(SLUG), next));
    let y = bonusY + 216;
    if (hasNext) {
      makeButton(this, CX, y, t(last.locale, 'result.nextIntro', { n: next, intro: levelIntro(last.locale, next) }), () => this.play(next), { primary: true, height: 48, fontSize: 13 });
      y += 56;
    }
    if (!gap || !hasNext) {
      makeButton(this, CX, y, t(last.locale, 'result.playAgain'), () => this.play(last.level), { primary: !hasNext, height: 44 });
      y += 52;
    }
    makeButton(this, CX, y, t(last.locale, 'result.menu'), menu, { height: 44 });
    confetti({ disableForReducedMotion: true, particleCount: 60, spread: 76, origin: { y: 0.4 }, colors: [S.primary, S.accent, S.gold] });
    playSound('win');
  }
  private play(n: number) { this.registry.set('level', n); this.registry.set('howto', false); this.scene.start('Game'); }
  private text(x: number, y: number, label: string, size: number, color = S.ink) {
    return this.add.text(x, y, label, { fontFamily: FONT, fontSize: size, color, fontStyle: size >= 15 ? '600' : '400' }).setOrigin(0.5).setResolution(DPR);
  }
}
