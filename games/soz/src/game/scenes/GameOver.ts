import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import type { Row } from '../../core/gameState';
import { t } from '../../i18n';
import { makeButton, applyTheme, type Button } from '../ui';
import { COLORS, FONT } from '../palette';
import { buildShareText } from '../share';
import { loadDaily, saveDaily } from '../../core/persistence';
import type { Session } from '../../bridge/session';

interface LastGame {
  mode: 'daily' | 'practice';
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
    this.session = this.registry.get('session') as Session;
    this.last = this.registry.get('lastGame') as LastGame;
    const loc = this.last.locale;

    this.add
      .text(CX, 90, t(loc, this.last.solved ? 'result.won' : 'result.lost'), {
        fontFamily: FONT, fontSize: 34, color: '#e9e9ea', fontStyle: 'bold',
      })
      .setOrigin(0.5);

    if (!this.last.solved) {
      this.add
        .text(CX, 140, t(loc, 'result.answerWas', { word: this.last.answer }), {
          fontFamily: FONT, fontSize: 20, color: COLORS.headText,
        })
        .setOrigin(0.5);
    }

    // Эмодзи-грид результата.
    const share = buildShareText(this.last.rows, {
      solved: this.last.solved, guessesUsed: this.last.guessesUsed,
      dayId: this.last.dayId, title: t(loc, 'app.title'),
    });
    this.add
      .text(CX, 250, share.split('\n').slice(1).join('\n'), {
        fontFamily: 'monospace', fontSize: 22, color: COLORS.headText, align: 'center',
      })
      .setOrigin(0.5);

    let y = 400;
    makeButton(this, CX, y, t(loc, 'result.share'), () => this.session.shareResult(share));
    y += 62;

    // Награда — только daily + solved + ещё не забрана.
    if (this.last.mode === 'daily' && this.last.solved && !this.last.rewardClaimed) {
      const rewardId = `soz-daily-${this.last.dayId}`;
      let claimBtn: Button;
      const off = this.session.onReward((r) => {
        if (r.granted) {
          claimBtn.setLabel(t(loc, 'result.claimed', { points: r.points ?? 0 }));
          const saved = loadDaily(loc, this.last.dayId);
          if (saved) saveDaily(loc, this.last.dayId, { ...saved, rewardClaimed: true });
        }
      });
      this.events.once('shutdown', off);
      claimBtn = makeButton(this, CX, y, t(loc, 'result.claim'), () => this.session.claim(rewardId));
      y += 62;
    }

    makeButton(this, CX, y, t(loc, 'result.playAgain'), () => this.scene.start('MainMenu'));
    y += 62;

    // Лидерборд.
    const lbY = y + 10;
    this.add
      .text(CX, lbY, t(loc, 'result.leaderboard'), {
        fontFamily: FONT, fontSize: 18, color: COLORS.headText, fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const listText = this.add
      .text(CX, lbY + 26, '…', { fontFamily: FONT, fontSize: 15, color: '#b8bcc4', align: 'center' })
      .setOrigin(0.5, 0);
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
}
