import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { t } from '../../i18n';
import {
  applyTheme, setupCamera, playSound, sparkle, makeGameHeader, openPauseSheet, setBackHandler, TOP_BAR_H,
  runFirstMoveTutorial, showRuleOnce, type FirstMoveTutorial, type Rect,
  type GameHeader, type PauseSheet,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { GHOST_ALPHA, levelAt } from '../../core/levels';
import { createJigsawGame, nearestSlot, slotCenter, type JigsawGame } from '../../core/jigsaw';
import { mulberry32 } from '../../core/rng';
import { computeScore } from '../../core/score';
import { BASE_FRAME, buildPictureTexture, pieceFrameKey, PICTURE_SIZE } from '../picture';
import { hasOnboarded, setOnboarded } from '../../core/persistence';
import { createRoundTimer, type RoundTimer } from '../roundTimer';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';

const W = 400;
const CX = W / 2;
/** Поле сборки: квадрат под шапкой, пиксель в пиксель с текстурой картинки. */
const BOARD = PICTURE_SIZE;
const BOARD_LEFT = (W - BOARD) / 2;
const BOARD_TOP = TOP_BAR_H + 16; // поле сразу под шапкой партии
/** Лоток с кусочками под полем. */
const TRAY_TOP = BOARD_TOP + BOARD + 24;
const TRAY_H = 104;
/** Кусочек в лотке не крупнее этого — крупно, но с зазором между соседями. */
const TRAY_PIECE_MAX = 78;
/** Зазор между кусочками в лотке, когда их там четыре. */
const TRAY_GAP = 8;
/** Кусочек в руке во время обучения — над приглушением (900), под паузой (1000). */
const TUTORIAL_DRAG_DEPTH = 920;

export class Game extends Scene {
  private locale: Locale = 'ru';
  private level = 1;
  /** Партия — уровень дня: параметры уровня лестницы, расклад по зерну от даты. */
  private daily = false;
  /** Сколько кусочков лежит в лотке одновременно — рычаг уровня (3 или 4). */
  private traySlots = 3;
  private session!: Session;
  private core!: JigsawGame;
  private timer?: RoundTimer;

  private pieceW = 0;
  private pieceH = 0;
  private textureKey = '';
  private ghost?: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Graphics;
  private header?: GameHeader;
  private pause: PauseSheet | null = null;
  private hintText!: Phaser.GameObjects.Text;
  /** Кусочки, лежащие в лотке: id → спрайт. */
  private trayViews = new Map<number, Phaser.GameObjects.Image>();
  private finished = false;
  /** Партия стоит: пауза приложения (PAUSE от моста) или открытый шит паузы. */
  private paused = false;
  /** Обучение в один шаг: первый кусочек на своём месте — настоящий ход (T6). */
  private tutorial: FirstMoveTutorial | null = null;

  constructor() {
    super('Game');
  }

  create() {
    // Сцена переиспользуется между картинками — сбрасываем изменяемое состояние.
    this.trayViews = new Map();
    this.finished = false;
    this.paused = false;
    this.tutorial = null;
    this.ghost = undefined;
    this.header = undefined;
    this.pause = null;
    // Системный «назад» ведёт туда же, куда стрелка: партия → пауза → меню.
    setBackHandler(() => this.onSystemBack());

    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.level = (this.registry.get('level') as number) ?? 1;
    // Уровень дня: параметры уровня лестницы, но порядок кусочков по зерну от даты — один на всех.
    this.daily = this.registry.get('mode') === 'dailyLevel';
    this.session = this.registry.get('session') as Session;

    const params = levelAt(this.level).params;
    this.traySlots = params.tray;
    const seed = this.daily
      ? (this.registry.get('dailySeed') as number)
      : Math.floor(Math.random() * 2 ** 31);
    this.core = createJigsawGame({ cols: params.cols, rows: params.rows }, mulberry32(seed));
    this.pieceW = BOARD / this.core.cols;
    this.pieceH = BOARD / this.core.rows;
    this.textureKey = buildPictureTexture(this, params.picture, this.core.cols, this.core.rows);

    this.buildHud();
    this.buildBoard(GHOST_ALPHA[params.hint] ?? 0);
    this.buildTray();
    this.refillTray();
    this.bindDrag();

    const off = this.session.onApp((e: AppToGameEvent) => {
      if (e.type === 'PAUSE') { this.paused = true; this.timer?.pause(); }
      // Приложение вернулось, но шит паузы открыт — партия ждёт «Продолжить».
      // В обучении часы стоят до первого кусочка на месте.
      else if (e.type === 'RESUME' && !this.pause?.open) {
        this.paused = false;
        if (!this.tutorial?.active) this.timer?.resume();
      }
    });
    this.events.once('shutdown', off);

    this.timer = createRoundTimer(() => performance.now());
    this.session.start();
    this.timer.start();

    // «Как играть» из паузы — то же обучение на новой партии.
    const howto = this.registry.get('howto') === true;
    this.registry.set('howto', false);
    if (howto || !hasOnboarded()) this.startTutorial();
  }

  // ── Экран ────────────────────────────────────────────────────────────────────

  /**
   * Шапка каталога: стрелка (пауза), «Картинка N» или «Уровень дня» и чип
   * «собрано из скольких». Таймера и проигрыша у пазла нет — чип один.
   * Раньше здесь были белая пилюля «Назад» и текстовый счётчик справа.
   */
  private buildHud() {
    const total = this.core.total;
    this.header = makeGameHeader(this, {
      title: this.daily ? t(this.locale, 'game.dailyLevel') : t(this.locale, 'game.level', { n: this.level }),
      chips: [
        { id: 'progress', text: this.progressLabel(), widest: t(this.locale, 'game.progress', { n: total, total }) },
      ],
      onBack: () => this.openPause(),
    });

    this.hintText = this.add
      .text(CX, TRAY_TOP + TRAY_H + 22, t(this.locale, 'game.take'), {
        fontFamily: FONT, fontSize: 14, color: COLORS.headMuted, align: 'center',
        wordWrap: { width: 340 },
      })
      .setOrigin(0.5)
      .setResolution(DPR);
  }

  /** Поле: сетка пустых клеток и бледная картинка-подсказка; `ghostAlpha` 0 — без неё. */
  private buildBoard(ghostAlpha: number) {
    this.board = this.add.graphics();
    this.board.fillStyle(COLORS.slot, 1)
      .fillRoundedRect(BOARD_LEFT, BOARD_TOP, BOARD, BOARD, 14);

    if (ghostAlpha > 0) {
      this.ghost = this.add
        .image(BOARD_LEFT + BOARD / 2, BOARD_TOP + BOARD / 2, this.textureKey, BASE_FRAME)
        .setDisplaySize(BOARD, BOARD)
        .setAlpha(ghostAlpha);
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
    const step = BOARD / this.traySlots;
    return { x: BOARD_LEFT + step * (i + 0.5), y: TRAY_TOP + TRAY_H / 2 };
  }

  /** Масштаб кусочка в лотке: крупный, но чтобы все места лотка помещались в ряд. */
  private trayScale(): number {
    const maxW = Math.min(TRAY_PIECE_MAX, BOARD / this.traySlots - TRAY_GAP);
    const fit = Math.min(maxW / this.pieceW, (TRAY_H - 18) / this.pieceH);
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
      if (this.trayViews.size >= this.traySlots) break;
      while (taken.has(slotIndex)) slotIndex++;
      if (slotIndex >= this.traySlots) break;
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
      if (this.finished || this.paused) return;
      // В обучении кусочек в руке — над приглушением, иначе его «гасит» по пути к месту.
      obj.setDepth(this.tutorial?.active ? TUTORIAL_DRAG_DEPTH : 20);
      // В руке кусочек показывается в натуральную величину поля — так видно, куда он встанет.
      this.tweens.add({
        targets: obj,
        displayWidth: this.pieceW, displayHeight: this.pieceH,
        duration: 120, ease: 'Quad.easeOut',
      });
    });

    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      if (this.finished || this.paused) return;
      obj.setPosition(x, y);
    });

    this.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      if (this.finished) return;
      // Пауза посреди перетаскивания — кусочек возвращается в лоток, а не висит в воздухе.
      if (this.paused) {
        this.returnToTray(obj);
        return;
      }
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
    // Первый кусочек на месте закрывает обучение: дальше обычная партия.
    this.tutorial?.done();

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
    this.header?.setChip('progress', this.progressLabel());
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
    // Правило про ошибку — в момент первой ошибки, а не карточкой заранее.
    showRuleOnce(this, 'jigsaw:wrong', t(this.locale, 'rule.wrong'));
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
      .finish({ level: this.level, mode: this.daily ? 'dailyLevel' : 'level', pieces, wrongDrops, durationMs })
      .then((res) => this.registry.set('scorePreview', res?.pointsAwarded ?? null));

    this.registry.set('lastGame', {
      locale: this.locale, level: this.level, daily: this.daily, pieces, wrongDrops, durationMs, score,
      picture: levelAt(this.level).params.picture,
    });
    this.cameras.main.fadeOut(250, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }

  // ── Шапка партии и пауза ─────────────────────────────────────────────────────

  /** «3 из 9» — сколько кусочков уже на поле. */
  private progressLabel(): string {
    return t(this.locale, 'game.progress', { n: this.core?.placed ?? 0, total: this.core?.total ?? 0 });
  }

  /** Стрелка в шапке: пауза с выбором, а не мгновенный выход. */
  private openPause() {
    if (this.finished || this.pause?.open) return;
    this.paused = true;
    this.timer?.pause();
    this.pause = openPauseSheet(this, {
      locale: this.locale,
      // Таймера и проигрыша нет — сводка короткая: сколько уже собрано.
      summary: t(this.locale, 'pause.progress', { progress: this.progressLabel() }),
      sound: { on: t(this.locale, 'sound.on'), off: t(this.locale, 'sound.off') },
      onResume: () => {
        this.pause = null;
        this.paused = false;
        // В обучении часы стоят до первого кусочка — «Продолжить» их не запускает.
        if (!this.tutorial?.active) this.timer?.resume();
      },
      onRestart: () => this.scene.restart(),
      onExit: () => this.exitToMenu(),
      onHowto: () => {
        this.registry.set('howto', true);
        this.scene.restart();
      },
    });
  }

  /** Системный «назад»: из паузы — в меню, иначе — открыть паузу. */
  private onSystemBack() {
    if (this.pause?.open) {
      this.pause.close();
      this.exitToMenu();
      return;
    }
    this.openPause();
  }

  private exitToMenu() {
    if (this.finished) return;
    this.finished = true;
    this.cameras.main.fadeOut(200, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MainMenu'));
  }

  // ── Обучение ─────────────────────────────────────────────────────────────────

  /**
   * Обучение в один шаг: поле видно, один кусочек в лотке и его место на поле
   * обведены и пульсируют, внизу одна фраза. Перетащить кусочек — настоящий ход;
   * часы и счётчик включаются после первого кусочка на месте. Ошибка
   * объясняется в момент ошибки. Историю про картинку обещает меню — здесь
   * её не повторяем.
   */
  private startTutorial() {
    const piece = this.pickTutorialPiece();
    if (piece === null) return;
    this.timer?.pause();
    this.header?.setChipsVisible(false);
    // Строка «Возьми кусочек…» под лотком дублирует полосу обучения.
    this.hintText.setVisible(false);
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.locale,
      text: t(this.locale, 'tutorial.firstMove'),
      targets: () => {
        const view = this.trayViews.get(piece);
        // Кусочек уже в руке или на месте — подсвечиваем только место.
        return view ? [this.trayPieceRect(view), this.slotRect(piece)] : [this.slotRect(piece)];
      },
      pad: 4,
      radius: 10,
      onDone: () => {
        setOnboarded();
        this.header?.setChipsVisible(true);
        this.hintText.setVisible(true);
        if (!this.pause?.open && !this.paused) this.timer?.resume();
      },
    });
  }

  /**
   * Кусочек для первого хода: из лежащих в лотке — тот, чьё место на поле
   * ближе всего к нему. Короткий путь пальца — малышу проще дотянуть.
   */
  private pickTutorialPiece(): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [piece, view] of this.trayViews) {
      const pos = this.trayPos(view.getData('trayIndex') as number);
      const c = slotCenter(piece, this.core.cols, this.pieceW, this.pieceH);
      const d = Math.hypot(BOARD_LEFT + c.x - pos.x, BOARD_TOP + c.y - pos.y);
      if (d < bestDist) { bestDist = d; best = piece; }
    }
    return best;
  }

  /** Кусочек в лотке — по его месту в лотке, а не по текущему размеру (он «выпрыгивает»). */
  private trayPieceRect(view: Phaser.GameObjects.Image): Rect {
    const pos = this.trayPos(view.getData('trayIndex') as number);
    const scale = this.trayScale();
    const w = this.pieceW * scale;
    const h = this.pieceH * scale;
    return { x: pos.x - w / 2, y: pos.y - h / 2, w, h };
  }

  /** Место кусочка на поле. */
  private slotRect(piece: number): Rect {
    const c = slotCenter(piece, this.core.cols, this.pieceW, this.pieceH);
    return {
      x: BOARD_LEFT + c.x - this.pieceW / 2, y: BOARD_TOP + c.y - this.pieceH / 2,
      w: this.pieceW, h: this.pieceH,
    };
  }
}
