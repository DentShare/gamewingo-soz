import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import { createColorSortState, canMove, move, type ColorSortState, type LiquidColor } from '../../core/colorSort';
import { levelAt, type ColorSortLevel } from '../../core/levels';
import { COLORS, FONT, LIQUID_COLORS } from '../palette';
import {
  applyTheme, setupCamera, makeButton, makeCard, createGameHeader, openPauseSheet, runFirstMoveTutorial, guardBrowserBack,
  playSound, toast, EASE, DUR, squash, sparkle, C,
} from '../ui';
import { DPR } from '../dpr';
import { t } from '../../i18n';
import type { Session } from '../../bridge/session';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createRoundActivity, type RoundActivity, type PauseReason } from '../roundActivity';
import { loadProgress } from '@gamewingo/game-progress';
import { activeTime } from '../presentation';
import { liquidBands, pouringAngle, uprightSurface, type LiquidLayer } from '../liquid';
import { tubePositions } from '../boardLayout';

const W = 400;
const TUBE_W = 48;
const TUBE_H = 142;

interface TubeView {
  root: Phaser.GameObjects.Container;
  outline: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Graphics;
  liquid: Phaser.GameObjects.Graphics;
  baseX: number;
  baseY: number;
}

export class Game extends Scene {
  private locale: Locale = 'ru';
  private session?: Session;
  private level!: ColorSortLevel;
  private state!: ColorSortState;
  private history: ColorSortState[] = [];
  private views: TubeView[] = [];
  private selected: number | null = null;
  private header!: ReturnType<typeof createGameHeader>;
  private activity!: RoundActivity;
  private sheet?: ReturnType<typeof openPauseSheet>;
  private tutorial?: ReturnType<typeof runFirstMoveTutorial>;
  private tutorialPair?: { from: number; to: number };
  private controls: Phaser.GameObjects.Container[] = [];
  private hint!: Phaser.GameObjects.Text;
  private lastHeader = '';
  private pendingTutorial = false;
  private busy = false;
  private finished = false;

  constructor() { super('Game'); }

  create() {
    this.views = []; this.history = []; this.selected = null; this.busy = false; this.finished = false;
    this.sheet = undefined; this.tutorial = undefined; this.tutorialPair = undefined; this.controls = []; this.lastHeader = ''; this.pendingTutorial = false;
    this.time.paused = false; this.tweens.resumeAll();
    this.activity = createRoundActivity(() => performance.now());
    this.registry.set('rewardPromise', null);
    applyTheme(this); setupCamera(this); this.cameras.main.fadeIn(200, ...COLORS.fade);
    this.locale = (this.registry.get('locale') as Locale) ?? 'ru';
    this.session = this.registry.get('session') as Session | undefined;
    this.level = levelAt((this.registry.get('level') as number) ?? 1);
    this.state = createColorSortState(this.level);
    const howto = Boolean(this.registry.get('howto')) || (!this.registry.get('preview') && this.level.n === 1 && !loadProgress('color-sort').stars[0]);
    this.registry.set('howto', false);

    this.buildHud();
    this.buildBoard();
    this.buildControls();
    if (howto) this.startTutorial(); else this.beginRound();
    const offHost = this.session?.onApp((event: AppToGameEvent) => {
      if (event.type === 'PAUSE') { this.setPause('host', true); this.openPause(); }
      else if (event.type === 'RESUME') this.setPause('host', false);
    });
    const onVisibility = () => { this.setPause('hidden', document.hidden); if (document.hidden) this.openPause(); };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.hidden) onVisibility();
    const offBack = guardBrowserBack(() => { if (this.sheet) this.exitToMenu(); else this.openPause(); });
    this.events.once('shutdown', () => {
      offHost?.(); offBack(); document.removeEventListener('visibilitychange', onVisibility);
      this.sheet?.destroy(); this.tutorial?.destroy(); this.activity.complete(); this.time.paused = false;
    });
  }

  private buildHud() {
    this.header = createGameHeader(this, { title: t(this.locale, 'game.level', { n: this.level.n }), chips: ['', ''], onBack: () => this.openPause() });
    this.hint = this.add.text(W / 2, 79, t(this.locale, 'game.hint'), {
      fontFamily: FONT, fontSize: 14, color: COLORS.headMuted, align: 'center', wordWrap: { width: 350 },
    }).setOrigin(0.5).setResolution(DPR);
  }

  private buildBoard() {
    makeCard(this, 16, 112, 368, 470).setDepth(0);
    const positions = tubePositions(this.state.tubes.length);
    this.state.tubes.forEach((_, index) => this.views.push(this.makeTube(index, positions[index].x, positions[index].y)));
    this.syncViews();
  }

  private makeTube(index: number, x: number, y: number): TubeView {
    const root = this.add.container(x, y).setDepth(4);
    const glow = this.add.graphics().setAlpha(0);
    glow.lineStyle(7, COLORS.primary, 0.24).strokeRoundedRect(-TUBE_W / 2 - 5, -TUBE_H / 2 - 5, TUBE_W + 10, TUBE_H + 10, 18);
    const outline = this.add.graphics();
    const glass = this.add.graphics();
    glass.fillStyle(C.slotSoft, 0.6).fillRoundedRect(-TUBE_W / 2, -TUBE_H / 2, TUBE_W, TUBE_H, 14);
    const liquid = this.add.graphics();
    // Открытое горлышко и U-образное стекло: видно, откуда выходит струя.
    outline.lineStyle(3, COLORS.panelBorder, 1).beginPath();
    outline.moveTo(-24, -71); outline.lineTo(-24, 47);
    outline.arc(0, 47, 24, Math.PI, 0, true);
    outline.lineTo(24, -71); outline.strokePath();
    outline.lineStyle(2, C.white, 0.65).lineBetween(-15, -53, -15, 46);
    outline.lineStyle(2, COLORS.panelBorder, 1).strokeEllipse(0, -71, 51, 7);
    const hit = this.add.rectangle(0, 0, TUBE_W + 30, TUBE_H + 12, C.white, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.tapTube(index));
    root.add([glow, glass, liquid, outline, hit]);
    return { root, glow, outline, liquid, baseX: x, baseY: y };
  }

  private syncViews() {
    this.views.forEach((view, index) => {
      this.paintLiquid(view, this.layers(this.state.tubes[index].colors));
    });
    this.update();
  }

  update() {
    if (!this.header || !this.activity) return;
    const moves = `${this.state.moves} / ${this.level.goals.gold}`;
    const time = activeTime(this.activity.elapsedMs());
    if (this.lastHeader !== `${moves}|${time}`) { this.lastHeader = `${moves}|${time}`; this.header.setChips([moves, time]); }
  }

  private beginRound() {
    if (!this.activity.started && !this.registry.get('preview')) this.session?.start();
    this.activity.begin();
  }

  private layers(colors: readonly LiquidColor[], removed = 0): LiquidLayer[] {
    return colors.map((color, index) => ({
      color: LIQUID_COLORS[color], amount: Math.max(0, Math.min(1, colors.length - removed - index)),
    }));
  }

  private paintLiquid(view: TubeView, layers: readonly LiquidLayer[]) {
    const g = view.liquid.clear();
    const bands = liquidBands(layers, view.root.rotation);
    for (const band of bands) {
      if (band.points.length < 3) continue;
      g.fillStyle(band.color, 1).beginPath();
      g.moveTo(band.points[0].x, band.points[0].y);
      for (const point of band.points.slice(1)) g.lineTo(point.x, point.y);
      g.closePath().fillPath();
    }
    // Светлая кромка мениска остаётся горизонтальной относительно экрана.
    const top = bands[bands.length - 1];
    if (top) {
      const sin = Math.sin(view.root.rotation), cos = Math.cos(view.root.rotation);
      const minY = Math.min(...top.points.map((p) => p.x * sin + p.y * cos));
      const edge = top.points.filter((p) => Math.abs(p.x * sin + p.y * cos - minY) < 0.01);
      if (edge.length >= 2) g.lineStyle(1.4, C.white, 0.45).lineBetween(edge[0].x, edge[0].y, edge[edge.length - 1].x, edge[edge.length - 1].y);
    }
  }

  private buildControls() {
    this.controls = [
      makeButton(this, 106, 620, t(this.locale, 'game.undo'), () => this.undo(), { width: 168, height: 44 }).root,
      makeButton(this, 294, 620, t(this.locale, 'game.restart'), () => this.restart(), { width: 168, height: 44 }).root,
    ];
  }

  private startTutorial() {
    if (this.tutorial || this.finished) return;
    if (this.busy) { this.pendingTutorial = true; return; }
    this.pendingTutorial = false;
    let pair: { from: number; to: number } | undefined;
    for (let from = 0; from < this.state.tubes.length && !pair; from++) {
      const to = this.state.tubes.findIndex((_, index) => canMove(this.state, from, index));
      if (to >= 0) pair = { from, to };
    }
    if (!pair) { this.beginRound(); return; }
    this.clearSelection(); this.tutorialPair = pair;
    const targets = this.views.map((view) => ({ root: view.root, outline: view.glow }));
    this.header.setMetricsVisible(false);
    this.hint.setText(t(this.locale, 'tutorial.waiting'));
    this.controls.forEach((root) => root.setVisible(false));
    // Повторное обучение также исключается из активного времени партии.
    this.activity.pause('sheet');
    this.tutorial = runFirstMoveTutorial(this, {
      allTargets: targets, targets: [targets[pair.from]], hint: t(this.locale, 'tutorial.firstMove'), skip: t(this.locale, 'onboarding.skip'),
      onDone: () => {
        this.tutorial = undefined; this.tutorialPair = undefined; this.activity.resume('sheet');
        this.header.setMetricsVisible(true); this.hint.setText(t(this.locale, 'game.hint'));
        this.controls.forEach((root) => root.setVisible(true)); this.beginRound();
      },
    });
    // Сохраняем идентичные объекты целей для смены подсветки после выбора.
    this.tutorialTargets = targets;
  }

  private tutorialTargets: { root: Phaser.GameObjects.Container; outline: Phaser.GameObjects.Graphics }[] = [];

  private tapTube(index: number) {
    if (this.busy || this.finished || this.sheet || this.activity.has('host') || this.activity.has('hidden')) return;
    if (this.tutorialPair && index !== (this.selected === null ? this.tutorialPair.from : this.tutorialPair.to)) return;
    const tube = this.state.tubes[index];
    if (this.selected === null) {
      if (tube.colors.length === 0) { this.invalid(index); return; }
      this.select(index);
      if (this.tutorialPair) this.tutorial?.setTargets([this.tutorialTargets[this.tutorialPair.from], this.tutorialTargets[this.tutorialPair.to]], t(this.locale, 'tutorial.drop'));
      return;
    }
    if (this.selected === index) { this.clearSelection(); return; }
    const from = this.selected;
    const result = move(this.state, from, index);
    if (!result.valid) { this.invalid(index); return; }
    this.history.push(this.state);
    this.busy = true;
    this.animateMove(from, index, result.moved, () => {
      if (this.finished || !this.scene.isActive()) return;
      this.state = result.state;
      this.clearSelection(); this.syncViews(); squash(this, this.views[index].root);
      if (result.completedTube !== null) {
        playSound('ok'); sparkle(this, this.views[index].root.x, this.views[index].root.y, { colors: [COLORS.primary, COLORS.accent], count: 16 });
        toast(this, W / 2, 560, t(this.locale, 'game.complete'));
      } else playSound('tap');
      this.busy = false;
      this.tutorial?.complete();
      if (this.state.completed) { this.finished = true; this.activity.complete(); this.time.delayedCall(700, () => this.endGame()); }
      else if (this.pendingTutorial) this.startTutorial();
    });
  }

  private select(index: number) {
    this.clearSelection(); this.selected = index;
    const view = this.views[index]; view.glow.setAlpha(1);
    this.tweens.killTweensOf(view.root);
    view.root.setX(view.baseX);
    this.tweens.add({ targets: view.root, y: view.baseY - 12, duration: DUR.appear, ease: EASE.pop });
    playSound('tap');
  }

  private clearSelection() {
    if (this.selected === null) return;
    const view = this.views[this.selected]; view.glow.setAlpha(0);
    this.tweens.killTweensOf(view.root);
    view.root.setX(view.baseX);
    this.tweens.add({ targets: view.root, y: view.baseY, duration: DUR.tap, ease: EASE.settle });
    this.selected = null;
  }

  private invalid(index: number) {
    playSound('wrong'); toast(this, W / 2, 560, t(this.locale, 'game.invalid'));
    const root = this.views[index].root;
    const x = this.views[index].baseX;
    this.tweens.killTweensOf(root);
    this.tweens.add({ targets: root, x: { from: x - 5, to: x + 5 }, duration: 70, yoyo: true, repeat: 2, ease: EASE.smooth, onComplete: () => root.setX(x) });
  }

  private animateMove(from: number, to: number, colors: readonly LiquidColor[], done: () => void) {
    const source = this.views[from], target = this.views[to];
    const sourceColors = this.state.tubes[from].colors;
    const targetColors = this.state.tubes[to].colors;
    const color = LIQUID_COLORS[colors[0]];
    // Для крайних колб наклон направлен внутрь поля, чтобы стекло не уходило за экран.
    const direction = target.baseX < 145 ? -1 : target.baseX > 255 ? 1 : target.baseX >= source.baseX ? 1 : -1;
    const mouth = { x: target.baseX, y: target.baseY - TUBE_H / 2 - 22 };
    const pose = (angle: number) => {
      const sin = Math.sin(angle), cos = Math.cos(angle);
      return { x: mouth.x - (direction * 24 * cos + 71 * sin), y: mouth.y - (direction * 24 * sin - 71 * cos) };
    };
    const startAngle = direction * pouringAngle(sourceColors.length);
    const pourPose = pose(startAngle);
    const stream = this.add.graphics().setDepth(21);
    const flow = { amount: 0 };
    source.glow.setAlpha(0);
    this.tweens.killTweensOf(source.root);
    this.tweens.killTweensOf(target.root);
    source.root.setDepth(22).setScale(1).setX(source.baseX);
    target.root.setPosition(target.baseX, target.baseY).setScale(1);

    const paintSource = () => this.paintLiquid(source, this.layers(sourceColors, flow.amount));
    const paintFlow = () => {
      const progress = flow.amount / colors.length;
      const angle = direction * pouringAngle(sourceColors.length - flow.amount);
      const position = pose(angle);
      source.root.setPosition(position.x, position.y).setRotation(angle);
      paintSource();
      this.paintLiquid(target, [...this.layers(targetColors), { color, amount: flow.amount }]);
      const surfaceY = target.baseY + uprightSurface(targetColors.length + flow.amount);
      // Струя связана с кромкой горлышка, проходит через отверстие цели и доходит до жидкости.
      const width = 5 * Math.min(1, progress * 12, (1 - progress) * 12);
      stream.clear();
      if (width < 0.1) return;
      stream.lineStyle(width, color, 0.96).beginPath();
      stream.moveTo(mouth.x, mouth.y); stream.lineTo(mouth.x, surfaceY - 2); stream.strokePath();
      stream.lineStyle(Math.max(1, width * 0.25), C.white, 0.35).lineBetween(mouth.x - 1, mouth.y + 2, mouth.x - 1, surfaceY - 3);
      stream.lineStyle(1.4, color, 0.55).strokeEllipse(mouth.x, surfaceY, 13 + Math.sin(progress * Math.PI * 8) * 4, 4);
    };

    // Поднять → поднести и наклонить → перелить с сохранением объёма → вернуть на место.
    this.tweens.add({
      targets: source.root, y: Math.max(174, Math.min(source.baseY, target.baseY) - 110),
      duration: DUR.appear, ease: EASE.settle,
      onComplete: () => this.tweens.add({
        targets: source.root, x: pourPose.x, y: pourPose.y, rotation: startAngle,
        duration: DUR.move, ease: EASE.smooth, onUpdate: paintSource,
        onComplete: () => {
          playSound('swipe');
          this.tweens.add({
            targets: flow, amount: colors.length, duration: DUR.move + colors.length * 180,
            ease: 'Linear', onUpdate: paintFlow,
            onComplete: () => {
              stream.destroy();
              this.tweens.add({
                targets: source.root, x: source.baseX, y: source.baseY, rotation: 0,
                duration: DUR.move, ease: EASE.smooth, onUpdate: paintSource,
                onComplete: () => { source.root.setPosition(source.baseX, source.baseY).setRotation(0).setDepth(4); done(); },
              });
            },
          });
        },
      }),
    });
  }

  private undo() {
    if (this.busy || this.finished || this.activity.paused || this.history.length === 0) return;
    this.clearSelection(); this.state = this.history.pop()!; this.syncViews(); playSound('tap');
  }

  private restart() {
    if (this.busy || this.finished || this.activity.paused) return;
    this.scene.restart();
  }

  private setPause(reason: PauseReason, paused: boolean) {
    if (paused) this.activity.pause(reason); else this.activity.resume(reason);
    // Во время обучения счётчик стоит, но подсветка и разрешённое переливание живы.
    const freeze = Boolean(this.sheet) || this.activity.has('host') || this.activity.has('hidden');
    this.time.paused = freeze;
    if (freeze) this.tweens.pauseAll(); else this.tweens.resumeAll();
  }

  private openPause() {
    if (this.finished || this.sheet) return;
    this.sheet = openPauseSheet(this, {
      labels: { title: t(this.locale, 'pause.title'), resume: t(this.locale, 'pause.resume'), restart: t(this.locale, 'pause.restart'), exit: t(this.locale, 'pause.exit'), soundOn: t(this.locale, 'sound.on'), soundOff: t(this.locale, 'sound.off'), howto: t(this.locale, 'menu.howto') },
      summary: t(this.locale, 'pause.summary', { moves: this.state.moves, time: activeTime(this.activity.elapsedMs()) }),
      onResume: () => {
        if (this.activity.has('host')) { this.sheet?.setSummary(t(this.locale, 'pause.host')); return; }
        this.closePause();
      },
      onRestart: () => { if (!this.activity.has('host')) this.scene.restart(); else this.sheet?.setSummary(t(this.locale, 'pause.host')); },
      onExit: () => this.exitToMenu(),
      onHowto: () => { if (!this.activity.has('host')) { this.closePause(); this.startTutorial(); } else this.sheet?.setSummary(t(this.locale, 'pause.host')); },
    });
    this.setPause('sheet', true);
  }

  private closePause() {
    this.sheet?.destroy(); this.sheet = undefined; this.setPause('sheet', false);
    if (this.tutorial) this.activity.pause('sheet');
  }

  private exitToMenu() {
    if (this.finished) return;
    this.finished = true; this.scene.start('MainMenu');
  }

  private endGame() {
    const durationMs = Math.round(this.activity.elapsedMs());
    if (!this.registry.get('preview')) this.registry.set('rewardPromise', this.session?.finish({ level: this.level.n, moves: this.state.moves, par: this.level.par, durationMs }) ?? Promise.resolve(null));
    this.registry.set('lastGame', { level: this.level.n, locale: this.locale, moves: this.state.moves, par: this.level.par, durationMs });
    this.cameras.main.fadeOut(240, ...COLORS.fade);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameOver'));
  }
}
