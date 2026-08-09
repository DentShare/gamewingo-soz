import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import { applyTheme, setupCamera, makeBackButton, playSound, sparkle } from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { levelAt } from '../../core/levels';
import { createJigsawGame, nearestSlot, slotCenter, type JigsawGame } from '../../core/jigsaw';
import { mulberry32 } from '../../core/rng';
import { computeScore } from '../../core/score';
import { BASE_FRAME, buildPictureTexture, pieceFrameKey, PICTURE_SIZE } from '../picture';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { startOnboarding, type OnboardingStep, type Rect } from '../onboarding';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

const W = 400;
const CX = W / 2;
/** Поле сборки: квадрат под шапкой, пиксель в пиксель с текстурой картинки. */
const BOARD = PICTURE_SIZE;
const BOARD_LEFT = (W - BOARD) / 2;
const BOARD_TOP = 96;
/** Лоток с кусочками под полем. */
const TRAY_TOP = BOARD_TOP + BOARD + 24;
const TRAY_H = 104;
/** Сколько кусочков лежит в лотке одновременно — детской руке хватает трёх. */
const TRAY_SLOTS = 3;
/** Кусочек в лотке не крупнее этого, иначе три штуки не помещаются в ряд. */
const TRAY_PIECE_MAX = 78;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  private session!: Session;
  private core!: JigsawGame;
  private timer?: RoundTimer;

  private pieceW = 0;
  private pieceH = 0;
  private textureKey = '';
  private ghost?: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  /** Кусочки, лежащие в лотке: id → спрайт. */
  private trayViews = new Map<number, Phaser.GameObjects.Image>();
  private finished = false;
  private paused = false;
  private tutorialActive = false;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между картинками — сбрасываем изменяемое состояние.
    this.trayViews = new Map();
    this.finished = false;
    this.paused = false;
    this.tutorialActive = false;
    this.ghost = undefined;

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    this.session = this.registry.get('session') as Session;

    const params = levelAt(this.level).params;
    this.core = createJigsawGame(
      { cols: params.cols, rows: params.rows },
      mulberry32(Math.floor(Math.random() * 2 ** 31)),
    );
    this.pieceW = BOARD / this.core.cols;
    this.pieceH = BOARD / this.core.rows;
    this.textureKey = buildPictureTexture(this, params.picture, this.core.cols, this.core.rows);

    this.buildHud();
    this.buildBoard(params.ghost);
    this.buildTray();
    this.refillTray();
    this.bindDrag();

    // «Как играть» из меню: обучение поверх настоящего поля, без сессии и таймера.
    if (this.registry.get('howto')) {
      this.runHowto();
      return;
    }

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.paused = true; this.timer?.pause(); }
      else if (e.type === 'RESUME') { this.paused = false; this.timer?.resume(); }
    });
    this.events.once('shutdown', off);

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();
    this.maybeShowOnboarding();
  }

  // ── Экран ────────────────────────────────────────────────────────────────────

  private buildHud() {
    makeBackButton(this, 14 + 48, 34, t(this.locale, 'menu.back'), () => this.goBack());

    this.progressText = this.add
      .text(W - 20, 34, t(this.locale, 'game.progress', { n: 0, total: this.core.total }), {
        fontFamily: FONT, fontSize: 15, color: COLORS.headMuted, fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setResolution(DPR);

    this.hintText = this.add
      .text(CX, TRAY_TOP + TRAY_H + 22, t(this.locale, 'game.take'), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted, align: 'center',
        wordWrap: { width: 340 },
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Поле: сетка пустых клеток и (на ранних уровнях) бледная картинка-подсказка. */
  private buildBoard(withGhost: boolean) {
    this.board = this.add.graphics();
    this.board.fillStyle(COLORS.slot, 1)
      .fillRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD, BOARD, 14);

    if (withGhost) {
      this.ghost = this.add
        .image(BOARD_LEFT + BOARD / 2, BOARD_TOP + BOARD / 2, this.textureKey, BASE_FRAME)
        .setDisplaySize(BOARD, BOARD)
        .setAlpha(0.32);
    }

    // Линии сетки — чтобы ребёнок видел, куда именно класть кусочек.
    this.board.lineStyle(1, COLORS.slotLine, 1);
    for (let c = 1; c < this.core.cols; c++) {
      const x = BOARD_LEFT + c * this.pieceW;
      this.board.lineBetween(x, BOARD_TOP, x, BOARD_TOP + BOARD);
    }
    for (let r = 1; r < this.core.rows; r++) {
      const y = BOARD_TOP + r * this.pieceH;
      this.board.lineBetween(BOARD_LEFT, y, BOARD_LEFT + BOARD, y);
    }
    this.board.lineStyle(2, COLORS.slotLine, 1)
      .strokeRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD, BOARD, 14);
  }

  private buildTray() {
    const g = this.add.graphics();
    g.fillStyle(COLORS.trayBg, 1).fillRoundedRect(BOARD_LEFT, TRAY_TOP, BOARD, TRAY_H, 14);
    g.lineStyle(1, COLORS.trayBorder, 1).strokeRoundedRect(BOARD_LEFT, TRAY_TOP, BOARD, TRAY_H, 14);
  }

  /** Позиция i-го места в лотке. */
  private trayPos(i: number): { x: number; y: number } {
    const step = BOARD / TRAY_SLOTS;
    return { x: BOARD_LEFT + step * (i + 0.5), y: TRAY_TOP + TRAY_H / 2 };
  }

  /** Масштаб кусочка в лотке: крупный, но чтобы три штуки помещались в ряд. */
  private trayScale(): number {
    const fit = Math.min(TRAY_PIECE_MAX / this.pieceW, (TRAY_H - 18) / this.pieceH);
    return Math.min(1, fit);
  }

  /** Докладывает в лоток кусочки, пока есть свободные места и неразобранные кусочки. */
  private refillTray() {
    const inTray = new Set(this.trayViews.keys());
    const queue = this.core.pending.filter((p) => !inTray.has(p));
    let slotIndex = 0;
    const taken = new Set<number>();
    for (const [, view] of this.trayViews) taken.add(view.getData('trayIndex') as number);

    for (const piece of queue) {
      if (this.trayViews.size >= TRAY_SLOTS) break;
      while (taken.has(slotIndex)) slotIndex++;
      if (slotIndex >= TRAY_SLOTS) break;
      taken.add(slotIndex);
      this.spawnTrayPiece(piece, slotIndex);
      slotIndex++;
    }
  }

  private spawnTrayPiece(piece: number, trayIndex: number) {
    const pos = this.trayPos(trayIndex);
    const view = this.add
      .image(pos.x, pos.y, this.textureKey, pieceFrameKey(piece))
      .setDisplaySize(this.pieceW * this.trayScale(), this.pieceH * this.trayScale())
      .setData('piece', piece)
      .setData('trayIndex', trayIndex)
      .setDepth(5)
      .setInteractive({ draggable: true, useHandCursor: true });

    this.input.setDraggable(view);
    this.trayViews.set(piece, view);

    // Появление с подскоком — кусочек «выпрыгивает» в лоток.
    const scale = this.trayScale();
    view.setDisplaySize(this.pieceW * scale * 0.6, this.pieceH * scale * 0.6);
    this.tweens.add({
      targets: view,
      displayWidth: this.pieceW * scale, displayHeight: this.pieceH * scale,
      duration: 260, ease: 'Back.easeOut',
    });
  }

  // ── Перетаскивание ───────────────────────────────────────────────────────────

  private bindDrag() {
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      if (this.tutorialActive || this.finished || this.paused) return;
      obj.setDepth(20);
      // В руке кусочек показывается в натуральную величину поля — так видно, куда он встанет.
      this.tweens.add({
        targets: obj,
        displayWidth: this.pieceW, displayHeight: this.pieceH,
        duration: 120, ease: 'Quad.easeOut',
      });
    });

    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      if (this.tutorialActive || this.finished || this.paused) return;
      obj.setPosition(x, y);
    });

    this.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      if (this.tutorialActive || this.finished || this.paused) return;
      this.tryPlace(obj);
    });
  }

  private tryPlace(view: Phaser.GameObjects.Image) {
    const piece = view.getData('piece') as number;
    const localX = view.x - BOARD_LEFT;
    const localY = view.y - BOARD_TOP;
    const slot = nearestSlot(
      localX, localY, this.core.cols, this.core.rows,
      this.pieceW, this.pieceH, Math.max(this.pieceW, this.pieceH) * 0.75,
    );

    if (slot === null) {
      this.returnToTray(view);
      return;
    }

    const result = this.core.drop(piece, slot);
    if (result !== 'placed') {
      if (result === 'wrong') {
        playSound('wrong');
        this.missFeedback(view);
      }
      this.returnToTray(view);
      return;
    }

    playSound('ok');

    // Кусочек встал: фиксируем на поле ровно в клетке.
    const center = slotCenter(slot, this.core.cols, this.pieceW, this.pieceH);
    view.disableInteractive();
    view.setDepth(4);
    this.trayViews.delete(piece);
    this.tweens.add({
      targets: view,
      x: BOARD_LEFT + center.x, y: BOARD_TOP + center.y,
      displayWidth: this.pieceW, displayHeight: this.pieceH,
      duration: 160, ease: 'Quad.easeOut',
      onComplete: () => this.afterPlace(),
    });
    sparkle(this, BOARD_LEFT + center.x, BOARD_TOP + center.y, { count: 10, power: 0.6 });
    this.okFeedback(BOARD_LEFT + center.x, BOARD_TOP + center.y);
  }

  private afterPlace() {
    this.progressText.setText(
      t(this.locale, 'game.progress', { n: this.core.placed, total: this.core.total }),
    );
    if (this.core.isComplete) {
      this.ghost?.destroy();
      this.time.delayedCall(420, () => this.endGame());
      return;
    }
    this.refillTray();
  }

  /** Кусочек возвращается в лоток: промах ничем не наказывается, кроме счётчика. */
  private returnToTray(view: Phaser.GameObjects.Image) {
    const trayIndex = view.getData('trayIndex') as number;
    const pos = this.trayPos(trayIndex);
    const scale = this.trayScale();
    view.setDepth(5);
    this.tweens.add({
      targets: view,
      x: pos.x, y: pos.y,
      displayWidth: this.pieceW * scale, displayHeight: this.pieceH * scale,
      duration: 220, ease: 'Back.easeOut',
    });
  }

  private okFeedback(x: number, y: number) {
    const ring = this.add.circle(x, y, Math.min(this.pieceW, this.pieceH) * 0.45, COLORS.ok, 0.35).setDepth(6);
    this.tweens.add({
      targets: ring, scale: 1.8, alpha: 0, duration: 340, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private missFeedback(view: Phaser.GameObjects.Image) {
    this.tweens.add({
      targets: view, angle: { from: -6, to: 6 }, duration: 70, yoyo: true, repeat: 1,
      onComplete: () => view.setAngle(0),
    });
    this.hintText.setText(t(this.locale, 'game.almost'));
    this.time.delayedCall(1400, () => this.hintText.setText(t(this.locale, 'game.take')));
  }

  // ── Конец партии ─────────────────────────────────────────────────────────────

  private endGame() {
    if (this.finished) return;
    this.finished = true;
    const durationMs = Math.round(this.timer?.elapsedMs() ?? 0);
    const pieces = this.core.total;
    const wrongDrops = this.core.wrongDrops;
    const score = computeScore({ pieces, wrongDrops });

    void this.session
      .finish({ level: this.level, pieces, wrongDrops, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, level: this.level, pieces, wrongDrops, durationMs, score,
      picture: levelAt(this.level).params.picture,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  private goBack() {
    if (this.finished || this.tutorialActive) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /** «Как играть» из меню: настоящее поле, но без сессии и таймера; по концу — в меню. */
  private runHowto() {
    this.registry.set('howto', false); // одноразовый вход
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.scene.start('MainMenu');
      });
    });
  }

  /** Первая партия — показываем обучение один раз. */
  private maybeShowOnboarding() {
    if (hasOnboarded()) return;
    this.tutorialActive = true;
    this.time.delayedCall(360, () => {
      startOnboarding(this, this.locale, this.tutorialSteps(), () => {
        setOnboarded();
        this.tutorialActive = false;
      });
    });
  }

  private tutorialSteps(): OnboardingStep[] {
    return [
      { textKey: 'onboarding.take', target: (): Rect => this.trayRect(), pad: 8, radius: 14 },
      { textKey: 'onboarding.place', target: (): Rect => this.boardRect(), pad: 6, radius: 16 },
      { textKey: 'onboarding.story', target: (): Rect => this.boardRect(), pad: 6, radius: 16 },
    ];
  }

  private trayRect(): Rect {
    return { x: BOARD_LEFT, y: TRAY_TOP, w: BOARD, h: TRAY_H };
  }

  private boardRect(): Rect {
    return { x: BOARD_LEFT, y: BOARD_TOP, w: BOARD, h: BOARD };
  }
}
