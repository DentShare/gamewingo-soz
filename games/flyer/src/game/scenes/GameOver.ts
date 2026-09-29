import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, makeArcadeResult, uiText, pluralForm,
  type ChallengeCardOpts,
} from '../ui';
import { COLORS } from '../palette';
import { CHALLENGES } from '../../core/challenges';
import { settleArcadeRound, TARIFF } from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  score: number;
  passed: number;
  survivedSec: number;
  durationMs: number;
}

const SLUG = 'flyer';

const clock = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/**
 * Итог забега (T4, раздел 1f аудита): главная цифра — пройденные проёмы, а
 * не «Полёт окончен»; чипы очков и рекорда проёмов; «Почти! Испытание N» или
 * закрытое испытание; «Следом» — два следующих; расшифровка бонусов.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    // Системный «назад» с итогов — в меню игры, как кнопка «В меню».
    setBackHandler(() => this.scene.start('MainMenu'));
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;

    // Запись забега одним вызовом: испытания каскадом, рекорды, счётчики дня, бонусы и «почти».
    const { round, bonus, lines, outlook, bestsBefore } = settleArcadeRound({
      slug: SLUG,
      defs: CHALLENGES,
      metrics: { passed: last.passed, survivedSec: last.survivedSec, score: last.score },
      score: last.score,
    });

    // Рекорд — по главной цифре полёта, проёмам. Первый полёт рекордом не считается: побивать было нечего.
    const passedRecord = round.records.improved.includes('passed') && (bestsBefore.passed ?? 0) > 0;
    const good = round.closed.length > 0 || passedRecord;
    playSound(good ? 'win' : 'lose');
    if (good) confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.4 } });

    const challenge = (n: number) => t(loc, `challenge.${CHALLENGES[n - 1].id}`);
    let card: ChallengeCardOpts | null = null;
    if (outlook.almost) {
      const a = outlook.almost;
      card = {
        state: 'almost',
        title: uiText(loc, 'result.almostChallenge', { n: a.def.n }),
        reward: `+${a.reward}`,
        text: challenge(a.def.n),
        value: a.value,
        target: a.def.target,
        detail: uiText(loc, 'result.thisRunMissing', { v: a.value, m: a.missing }),
      };
    } else if (round.closed.length) {
      const c = round.closed[round.closed.length - 1];
      card = {
        state: 'done',
        title: uiText(loc, 'result.challengeDone', { n: c.n }),
        reward: `+${TARIFF.level(c.n)}`,
        text: challenge(c.n),
      };
    }

    const screen = makeArcadeResult(this, {
      locale: loc,
      caption: uiText(loc, 'result.run', { t: clock(last.durationMs) }),
      title: passedRecord
        ? uiText(loc, 'result.newRecord', { v: last.passed })
        : t(loc, `result.passed.${pluralForm(last.passed)}`, { n: last.passed }),
      chips: [
        t(loc, `result.points.${pluralForm(last.score)}`, { n: last.score }),
        uiText(loc, 'result.recordChip', { v: round.records.bests.passed ?? last.passed }),
      ],
      challenge: card,
      following: {
        header: uiText(loc, 'result.following'),
        hint: outlook.nextReward ? uiText(loc, 'result.upTo', { n: outlook.nextReward }) : undefined,
        rows: outlook.next.map((p) => ({ text: challenge(p.def.n), value: p.value, target: p.def.target })),
      },
      lines,
      total: bonus.total,
      primary: { label: uiText(loc, 'result.moreRun'), onClick: () => this.scene.start('Game') },
      onMenu: () => this.scene.start('MainMenu'),
      mood: good ? 'happy' : 'sad',
    });

    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1100, () => {
        playSound('coin');
        bonusChip.award(bonus.total, screen.awardFrom.x, screen.awardFrom.y);
      });
    }
  }
}
