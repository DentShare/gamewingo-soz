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
  maxTile: number;
  moves: number;
  durationMs: number;
  tile256in220: number;
  tile512in400: number;
  tile1024in800: number;
}

const SLUG = '2048';

const clock = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/**
 * Итог партии (T4, раздел 1f аудита): главная цифра — старшая плитка, а не
 * «Партия окончена»; чипы очков и рекорда плитки; «Почти! Испытание N —
 * не хватило 3» или закрытое испытание; «Следом» — два следующих; расшифровка бонусов.
 *
 * Итог показывается только у закончившейся партии (ходов нет): Game стирает
 * сохранение до перехода сюда, так что «Продолжить» её не воскресит. Выход
 * в меню посреди партии итога не даёт — партия сохранена и продолжается.
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

    // Запись партии одним вызовом: испытания каскадом, рекорды, счётчики дня, бонусы и «почти».
    const { round, bonus, lines, outlook, bestsBefore } = settleArcadeRound({
      slug: SLUG,
      defs: CHALLENGES,
      // score и в метриках: по нему судятся испытания «Набери N очков».
      metrics: {
        score: last.score, maxTile: last.maxTile, moves: last.moves,
        tile256in220: last.tile256in220, tile512in400: last.tile512in400,
        tile1024in800: last.tile1024in800,
      },
      score: last.score,
    });

    // Главная цифра — старшая плитка: её помнят («дошёл до 1024»). Первая партия рекордом не считается.
    const tileRecord = round.records.improved.includes('maxTile') && (bestsBefore.maxTile ?? 0) > 0;
    const good = round.closed.length > 0 || tileRecord;
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
        // «В этой партии», а не общее «В этом забеге»: у 2048 партия.
        detail: t(loc, 'result.thisGameMissing', { v: a.value, m: a.missing }),
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
      caption: t(loc, 'result.game', { t: clock(last.durationMs) }),
      title: tileRecord
        ? uiText(loc, 'result.newRecord', { v: last.maxTile })
        : t(loc, 'result.tile', { n: last.maxTile }),
      chips: [
        t(loc, `result.points.${pluralForm(last.score)}`, { n: last.score }),
        uiText(loc, 'result.recordChip', { v: round.records.bests.maxTile ?? last.maxTile }),
      ],
      challenge: card,
      following: {
        header: uiText(loc, 'result.following'),
        hint: outlook.nextReward ? uiText(loc, 'result.upTo', { n: outlook.nextReward }) : undefined,
        rows: outlook.next.map((p) => ({ text: challenge(p.def.n), value: p.value, target: p.def.target })),
      },
      lines,
      total: bonus.total,
      // Новая партия: без флага resume Game стирает сохранение и раздаёт поле заново.
      primary: {
        label: t(loc, 'result.newGame'),
        onClick: () => {
          this.registry.set('resume', false);
          this.scene.start('Game');
        },
      },
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
