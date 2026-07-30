import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Row } from '../../core/gameState';
import { t } from '../../i18n';
import { makeButton, applyTheme, setupCamera, type Button, makeGlyph, makeStarRow } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { buildShareText } from '../share';
import { loadDaily, saveDaily } from '../../core/persistence';
import { currentStreak } from '../../bridge/demo';
import type { Session } from '../../bridge/session';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import {
  recordLevelResult, recordEndlessResult, starsFor, loadProgress, isUnlocked, type RecordResult,
} from '@gamewingo/game-progress';
import { computeScore } from '../../core/score';

const SLUG = 'soz';

interface LastGame {
  mode: 'daily' | 'practice';
  /** Номер уровня лестницы; для слова дня не используется. */
  level: number;
  locale: Locale;
  dayId: number;
  solved: boolean;
  guessesUsed: number;
  answer: string;
  rows: Row[];
  rewardClaimed: boolean;
}

const CX = 200;

export class GameOver extends Scene {
  private session!: Session;
  private last!: LastGame;

  constructor() {
    super('GameOver');
  }

  create() {
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    this.session = this.registry.get('session') as Session;
    this.last = this.registry.get('lastGame') as LastGame;
    const loc = this.last.locale;
    const won = this.last.solved;
    const record = this.recordLadder(won);

    // Заголовок с pop-in (overshoot).
    const emoji = makeGlyph(this, CX, 70, won ? 'star' : 'drop', 44).setScale(0);
    this.tweens.add({ targets: emoji, scale: 1, duration: 420, delay: 120, ease: 'Back.easeOut' });

    const title = this.add
      .text(CX, 128, t(loc, won ? 'result.won' : 'result.lost'), {
        fontFamily: FONT, fontSize: 32, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR)
      .setScale(0.7)
      .setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, delay: 200, ease: 'Back.easeOut' });

    // В тренировке под заголовком — уровень и заработанные звёзды.
    if (this.last.mode === 'practice') {
      this.add
        .text(CX, 162, t(loc, 'result.level', { n: this.last.level, total: LADDER_SIZE }), {
          fontFamily: FONT, fontSize: 15, color: COLORS.headMuted,
        })
        .setOrigin(0.5)
        .setResolution(DPR);
      const stars = won ? starsFor(levelAt(this.last.level).goals, this.last.guessesUsed) : 0;
      const row = makeStarRow(this, CX, 196, stars, 18).setScale(0);
      this.tweens.add({ targets: row, scale: 1, duration: 380, delay: 320, ease: 'Back.easeOut' });
    }

    if (!won) {
      this.appear(
        this.add
          .text(CX, this.last.mode === 'practice' ? 228 : 168, t(loc, 'result.answerWas', { word: this.last.answer }), {
            fontFamily: FONT, fontSize: 19, color: COLORS.headText,
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        320,
      );
    }

    // Стрик (в демо — из локального бэкенда; решённое слово дня).
    const streak = currentStreak();
    if (won && this.last.mode === 'daily' && streak >= 1) {
      this.appear(
        this.add
          .text(CX, 168, t(loc, 'result.streak', { n: streak }), {
            fontFamily: FONT, fontSize: 20, color: COLORS.headText, fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setResolution(DPR),
        300,
      );
    }

    // Эмодзи-грид результата.
    const share = buildShareText(this.last.rows, {
      solved: won, guessesUsed: this.last.guessesUsed,
      dayId: this.last.dayId, title: t(loc, 'app.title'),
    });
    this.appear(
      this.add
        .text(CX, 250, share.split('\n').slice(1).join('\n'), {
          fontFamily: 'monospace', fontSize: 22, color: COLORS.headText, align: 'center', lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setResolution(DPR),
      380,
    );

    let y = 392;
    let step = 0;
    const btn = (label: string, onClick: () => void, primary = false): Button => {
      const b = makeButton(this, CX, y, label, onClick, primary ? { primary: true } : {});
      this.appear(b.root, 440 + step * 70);
      y += 64;
      step++;
      return b;
    };

    // Награда — только daily + solved + ещё не забрана.
    if (this.last.mode === 'daily' && won && !this.last.rewardClaimed) {
      const rewardId = `soz-daily-${this.last.dayId}`;
      const claimBtn = btn(t(loc, 'result.claim'), () => this.session.claim(rewardId), true);
      const off = this.session.onReward((r) => {
        if (!r.granted) return;
        claimBtn.setLabel(t(loc, 'result.claimed', { points: r.points ?? 0 }));
        this.tweens.add({
          targets: claimBtn.root, scale: 1.1, duration: 140, yoyo: true, ease: 'Quad.easeOut',
        });
        const saved = loadDaily(loc, this.last.dayId);
        if (saved) saveDaily(loc, this.last.dayId, { ...saved, rewardClaimed: true });
      });
      this.events.once('shutdown', off);
    }

    btn(t(loc, 'result.share'), () => this.session.shareResult(share));

    // В тренировке предлагаем следующий уровень, если он открылся этой победой.
    const nextN = this.last.level + 1;
    const hasNext = this.last.mode === 'practice' && won
      && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    if (hasNext) {
      btn(t(loc, 'result.nextLevel', { n: nextN }), () => this.playLevel(nextN), true);
    }
    btn(t(loc, 'result.playAgain'), () => this.scene.start('MainMenu'));
    void record;

    // Лидерборд.
    const lbY = y + 16;
    const lbTitle = this.add
      .text(CX, lbY, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 17, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setResolution(DPR);
    const listText = this.add
      .text(CX, lbY + 26, '…', { fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(DPR);
    this.appear(lbTitle, 620);
    this.appear(listText, 660);
    void this.session.leaderboard(5).then((entries) => {
      if (!entries.length) {
        listText.setText(t(loc, 'error.network'));
        return;
      }
      listText.setText(
        entries.map((e) => `${e.rank}. ${e.name}  ${e.score}${e.isCurrentUser ? '  ←' : ''}`).join('\n'),
      );
    });
  }

  /** Появление снизу вверх с fade. */
  /**
   * Записывает результат тренировки в лестницу. Слово дня в лестницу не идёт —
   * это отдельный режим со своей наградой, но в счётчики дня попадает.
   */
  private recordLadder(won: boolean): RecordResult | null {
    if (this.last.mode !== 'practice') {
      recordEndlessResult(SLUG, won ? computeScore({ guessesUsed: this.last.guessesUsed, solved: won, durationMs: 0 }) : 0);
      return null;
    }
    if (!won) {
      recordEndlessResult(SLUG, 0);
      return null;
    }
    const stars = starsFor(levelAt(this.last.level).goals, this.last.guessesUsed);
    const score = computeScore({ guessesUsed: this.last.guessesUsed, solved: true, durationMs: 0 });
    return recordLevelResult({ slug: SLUG, n: this.last.level, stars, score });
  }

  private playLevel(n: number) {
    this.registry.set('level', n);
    this.registry.set('mode', 'practice');
    this.scene.start('Game');
  }

  private appear(obj: { y: number; setAlpha(a: number): unknown }, delay: number) {
    const toY = obj.y;
    obj.setAlpha(0);
    obj.y = toY + 14;
    this.tweens.add({ targets: obj as object, y: toY, alpha: 1, duration: 300, delay, ease: 'Quad.easeOut' });
  }
}
