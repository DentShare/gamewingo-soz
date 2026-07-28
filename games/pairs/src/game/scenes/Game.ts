import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { LEVELS, buildDeck, type LevelId } from '../../core/deck';
import { createPairsGame, type PairsGame } from '../../core/game';
import { mulberry32 } from '../../core/rng';
import { COLORS, FONT } from '../palette';
import { applyTheme, darken } from '../ui';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundTimer, type RoundTimer } from '../roundTimer';

const W = 400;
const GRID_TOP = 96;
const GRID_BOTTOM = 660;
const GAP = 10;

interface CardView {
  root: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level: LevelId = 'easy';
  private session!: Session;
  private core!: PairsGame;
  private cards: CardView[] = [];
  private movesText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private timer!: RoundTimer;
  private locked = false;   // во время показа промаха
  private finished = false;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между рестартами — сбрасываем изменяемое состояние.
    this.cards = [];
    this.locked = false;
    this.finished = false;

    applyTheme(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as LevelId) ?? 'easy';
    this.session = this.registry.get('session') as Session;

    const spec = LEVELS[this.level];
    const deck = buildDeck(spec.pairs, mulberry32(Math.floor(Math.random() * 2 ** 31)));
    this.core = createPairsGame(deck);

    this.buildHud();
    this.buildGrid(spec.cols, spec.rows);

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') this.timer.pause();
      else if (e.type === 'RESUME') this.timer.resume();
    });
    this.events.once('shutdown', off);
  }

  update() {
    if (this.timeText && !this.finished) {
      const sec = Math.floor(this.timer.elapsedMs() / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      this.timeText.setText(`${mm}:${ss}`);
    }
  }

  // ── HUD: кнопка назад + ходы + таймер ────────────────────────────────────────

  private buildHud() {
    this.buildBackButton();
    this.movesText = this.add
      .text(W / 2 + 40, 34, t(this.locale, 'game.moves', { n: 0 }), {
        fontFamily: FONT, fontSize: 16, color: COLORS.headText,
      })
      .setOrigin(0.5);
    this.timeText = this.add
      .text(W - 20, 34, '00:00', { fontFamily: FONT, fontSize: 16, color: COLORS.headMuted })
      .setOrigin(1, 0.5);
  }

  /** Кнопка «Назад» в левом верхнем углу — возврат в главное меню (стиль каталога). */
  private buildBackButton() {
    const w = 92, h = 40, lip = 4, r = 12;
    const container = this.add.container(14 + w / 2, 34).setDepth(30);
    const base = this.add.graphics();
    base.fillStyle(darken(COLORS.panel, 0.14), 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    const faceC = this.add.container(0, -lip);
    const face = this.add.graphics();
    face.fillStyle(COLORS.panel, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    face.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    const ax = -w / 2 + 18;
    face.lineStyle(2.5, COLORS.iconDark, 1);
    face.beginPath();
    face.moveTo(ax + 5, -6); face.lineTo(ax - 4, 0); face.lineTo(ax + 5, 6);
    face.strokePath();
    const label = this.add
      .text(ax + 12, 0, t(this.locale, 'menu.back'), { fontFamily: FONT, fontSize: 16, color: COLORS.headText })
      .setOrigin(0, 0.5);
    faceC.add([face, label]);
    const hit = this.add.rectangle(0, -lip / 2, w, h + lip, 0x000000, 0).setInteractive({ useHandCursor: true });
    container.add([base, faceC, hit]);
    let pressed = false;
    const press = (down: boolean) => { faceC.y = down ? -1 : -lip; };
    hit.on('pointerdown', () => { pressed = true; press(true); });
    hit.on('pointerup', () => { if (pressed) { pressed = false; press(false); this.goBack(); } });
    hit.on('pointerout', () => { if (pressed) { pressed = false; press(false); } });
  }

  private goBack() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Сетка карточек ───────────────────────────────────────────────────────────

  private buildGrid(cols: number, rows: number) {
    const size = Math.floor(Math.min(
      (W - 24 - (cols - 1) * GAP) / cols,
      (GRID_BOTTOM - GRID_TOP - (rows - 1) * GAP) / rows,
    ));
    const gridW = cols * size + (cols - 1) * GAP;
    const gridH = rows * size + (rows - 1) * GAP;
    const left = (W - gridW) / 2 + size / 2;
    const top = GRID_TOP + (GRID_BOTTOM - GRID_TOP - gridH) / 2 + size / 2;

    for (let i = 0; i < this.core.deck.length; i++) {
      const cx = left + (i % cols) * (size + GAP);
      const cy = top + Math.floor(i / cols) * (size + GAP);
      this.cards.push(this.buildCard(i, cx, cy, size));
    }
  }

  private buildCard(index: number, cx: number, cy: number, size: number): CardView {
    const r = Math.max(10, Math.round(size * 0.16));
    const root = this.add.container(cx, cy);

    // Рубашка: оранжевая с «?»
    const back = this.add.container(0, 0);
    const backG = this.add.graphics();
    backG.fillStyle(darken(COLORS.cardBack, 0.25), 1).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, r);
    backG.fillStyle(COLORS.cardBack, 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    const mark = this.add
      .text(0, 0, '?', { fontFamily: FONT, fontSize: Math.round(size * 0.42), color: COLORS.cardBackMark, fontStyle: 'bold' })
      .setOrigin(0.5);
    back.add([backG, mark]);

    // Лицо: белая карточка с эмодзи (скрыто до переворота).
    const front = this.add.container(0, 0).setVisible(false);
    const frontG = this.add.graphics();
    frontG.fillStyle(0x000000, 0.08).fillRoundedRect(-size / 2, -size / 2 + 3, size, size, r);
    frontG.fillStyle(COLORS.panel, 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    frontG.lineStyle(1.5, COLORS.panelBorder, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, r);
    const symbol = this.add
      .text(0, 0, this.core.deck[index].symbol, { fontSize: Math.round(size * 0.52) })
      .setOrigin(0.5);
    front.add([frontG, symbol]);

    const hit = this.add.rectangle(0, 0, size, size, 0x000000, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.onCardTap(index));
    root.add([back, front, hit]);

    return { root, back, front };
  }

  // ── Логика взаимодействия ────────────────────────────────────────────────────

  private onCardTap(index: number) {
    if (this.finished || this.locked) return;
    const before = [...this.core.open];
    const result = this.core.flip(index);
    if (result === 'ignored') return;

    this.flipOpen(index);
    this.movesText.setText(t(this.locale, 'game.moves', { n: this.core.moves }));

    if (result === 'match' || result === 'won') {
      const pairIdx = before[0];
      this.time.delayedCall(170, () => {
        this.pulseMatch(pairIdx);
        this.pulseMatch(index);
      });
      if (result === 'won') {
        this.finished = true;
        this.time.delayedCall(650, () => this.endGame());
      }
    } else if (result === 'miss') {
      this.locked = true;
      const other = before[0];
      this.time.delayedCall(750, () => {
        this.core.closeMiss();
        this.flipClosed(index);
        this.flipClosed(other);
        this.locked = false;
      });
    }
  }

  /** Флип-анимация: сжать по X → показать лицо → раскрыть. */
  private flipOpen(i: number) {
    const c = this.cards[i];
    this.tweens.add({
      targets: c.root, scaleX: 0, duration: 90, ease: 'Quad.easeIn',
      onComplete: () => {
        c.back.setVisible(false);
        c.front.setVisible(true);
        this.tweens.add({ targets: c.root, scaleX: 1, duration: 90, ease: 'Quad.easeOut' });
      },
    });
  }

  private flipClosed(i: number) {
    const c = this.cards[i];
    this.tweens.add({
      targets: c.root, scaleX: 0, duration: 90, ease: 'Quad.easeIn',
      onComplete: () => {
        c.front.setVisible(false);
        c.back.setVisible(true);
        this.tweens.add({ targets: c.root, scaleX: 1, duration: 90, ease: 'Quad.easeOut' });
      },
    });
  }

  /** Найденная пара: зелёная вспышка + подпрыгивание. */
  private pulseMatch(i: number) {
    const c = this.cards[i];
    this.tweens.add({ targets: c.root, scale: 1.12, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
    const glow = this.add
      .rectangle(c.root.x, c.root.y, 10, 10, COLORS.matchGlow, 0.35)
      .setOrigin(0.5)
      .setScale(6)
      .setDepth(5);
    this.tweens.add({ targets: glow, alpha: 0, scale: 9, duration: 380, onComplete: () => glow.destroy() });
  }

  private endGame() {
    const durationMs = Math.round(this.timer.elapsedMs());
    const { moves, totalPairs } = this.core;

    void this.session
      .finish({ level: this.level, pairs: totalPairs, moves, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      level: this.level, locale: this.locale, pairs: totalPairs, moves, durationMs,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
