import { Scene, type GameObjects, type Input } from 'phaser';
import { C, S, FONT, DPR, VIEW_BOTTOM, setupCamera, applyTheme, makeButton, createGameHeader,
  makeRecordBadge, makeChallengeList, openPauseSheet, guardBrowserBack, runFirstMoveTutorial,
  playSound, motionAllowed, type FirstMoveTutorial } from '@gamewingo/game-ui';
import { challengeStates, loadBests } from '@gamewingo/game-progress';
import { recordPilotRound } from '../core/progress';
import { advance, createCourt, queueTap, HEIGHT, WIDTH, type Court } from '../core/court';
import { CHALLENGES } from '../core/challenges';
import { t, type Locale } from '../i18n';
import type { Session } from '../bridge/session';
import { COURT_X, COURT_Y, floor, basket, ballView } from './painters';

const SLUG = 'tap-hoops';
function locale(scene: Scene): Locale { return scene.registry.get('locale') ?? 'ru'; }
function prepare(scene: Scene) { setupCamera(scene); applyTheme(scene); }
function text(scene: Scene, x: number, y: number, value: string, size = 15, color = S.ink) {
  return scene.add.text(x, y, value, { fontFamily: FONT, fontSize: size, color, align: 'center',
    wordWrap: { width: 344 } }).setOrigin(0.5).setResolution(DPR);
}
function challengeText(loc: Locale, challenge: typeof CHALLENGES[number]) {
  return t(loc, `challenge.${challenge.id}`, { n: challenge.target });
}
function back(scene: Scene, callback: () => void) { const off = guardBrowserBack(callback); scene.events.once('shutdown', off); }

export class Boot extends Scene {
  constructor() { super('Boot'); }
  create() {
    prepare(this); const session: Session = this.registry.get('session'); let proceeded = false;
    const proceed = () => { if (proceeded) return; proceeded = true; this.registry.set('locale', session.locale); this.scene.start('MainMenu'); };
    const off = session.bridge.onApp(e => {
      if (e.type !== 'INIT') return;
      session.applyInit(e); this.registry.set('locale', session.locale); this.registry.set('theme', e.theme ?? null); proceed();
    });
    this.game.events.once('destroy', off); session.bridge.ready(); this.time.delayedCall(400, proceed);
  }
}
export class MainMenu extends Scene {
  constructor() { super('MainMenu'); }
  create() {
    prepare(this); const loc = locale(this);
    const exit = () => { const session: Session = this.registry.get('session'); session.exit();
      if (!session.hosted) window.location.assign('../'); };
    createGameHeader(this, { title: t(loc, 'app.title'), onBack: exit, chips: [] }); back(this, exit);
    text(this, 200, 78, t(loc, 'prototype'), 11, S.muted);
    ballView(this).root.setPosition(200, 151).setScale(3.1);
    text(this, 200, 207, t(loc, 'menu.subtitle'), 23);
    text(this, 200, 250, t(loc, 'menu.description'), 14, S.muted);
    makeRecordBadge(this, 200, 308, { label: t(loc, 'menu.record'), value: String(loadBests(SLUG).score ?? 0) });
    const states = challengeStates(SLUG, CHALLENGES);
    const list = makeChallengeList(this, 200, 355, {
      header: t(loc, 'menu.challenges', { k: states.filter(s => s.done).length, n: 15 }),
      rows: states.map(s => ({ ...s, text: challengeText(loc, s) })),
    });
    const y = Math.min(355 + list.height + 34, VIEW_BOTTOM - 112);
    makeButton(this, 200, y, t(loc, 'menu.play'), () => this.scene.start('Game'), { primary: true, height: 48 });
    for (const [i, lang] of (['ru', 'uz'] as const).entries()) makeButton(this, 166 + i * 68, y + 58, lang.toUpperCase(), () => {
      this.registry.set('locale', lang); this.scene.restart();
    }, { width: 60, height: 44, primary: lang === loc });
  }
}
export class Game extends Scene {
  world!: Court;
  private loc: Locale = 'ru';
  private paused = false;
  private hostPaused = false;
  private resultSent = false;
  private sheet: ReturnType<typeof openPauseSheet> | null = null;
  private tutorial: FirstMoveTutorial | null = null;
  private header!: ReturnType<typeof createGameHeader>;
  private ball!: ReturnType<typeof ballView>;
  private basketBack!: GameObjects.Graphics;
  private basketFront!: GameObjects.Graphics;
  private trail!: GameObjects.Graphics;
  private count!: GameObjects.Text;
  private target!: GameObjects.Text;
  private hint!: GameObjects.Text;
  private message = '';
  private messageUntil = 0;
  private headerSignature = '';
  private space?: Input.Keyboard.Key;
  private spaceReleased = false;
  constructor() { super('Game'); }
  create(data: { tutorial?: boolean } = {}) {
    prepare(this); this.loc = locale(this); this.paused = false; this.hostPaused = false; this.resultSent = false;
    this.sheet = null; this.tutorial = null; this.headerSignature = ''; this.spaceReleased = false;
    this.message = ''; this.messageUntil = 0;
    this.world = createCourt(Date.now() >>> 0, data.tutorial || !this.registry.get('hoopsTaught'));
    this.header = createGameHeader(this, { title: t(this.loc, 'app.title'), onBack: () => this.pause(), chips: ['0', '0:10'] });
    this.count = text(this, 200, 83, '', 17);
    const next = challengeStates(SLUG, CHALLENGES).find(c => c.active);
    this.target = text(this, 200, 111, next ? t(this.loc, 'game.target', { n: next.n, text: challengeText(this.loc, next) })
      : t(this.loc, 'game.allDone'), 11, S.muted);
    floor(this);
    const field = this.add.rectangle(200, COURT_Y + HEIGHT / 2, WIDTH, HEIGHT, C.surface, 0).setInteractive();
    field.on('pointerdown', () => this.tap());
    this.basketBack = this.add.graphics().setPosition(COURT_X, COURT_Y);
    this.trail = this.add.graphics().setPosition(COURT_X, COURT_Y);
    this.ball = ballView(this);
    this.basketFront = this.add.graphics().setPosition(COURT_X, COURT_Y);
    this.hint = text(this, 200, 643, '', 12, S.muted);
    makeButton(this, 200, 684, t(this.loc, 'game.tap'), () => this.tap(), { width: 304, height: 48, primary: true });
    text(this, 200, 719, t(this.loc, 'game.keyboard'), 10, S.muted);
    this.space = this.input.keyboard?.addKey('SPACE');
    this.input.keyboard?.addCapture('SPACE');
    const keydown = (event: KeyboardEvent) => { if (!event.repeat && this.spaceReleased) this.tap(); };
    this.input.keyboard?.on('keydown-SPACE', keydown);
    const off = (this.registry.get('session') as Session).bridge.onApp(e => {
      if (e.type === 'PAUSE') { this.hostPaused = true; this.pause(); }
      if (e.type === 'RESUME') this.hostPaused = false;
    });
    const visibility = () => { if (document.hidden) this.pause(); }, blur = () => this.pause();
    const cancel = () => this.clearInput();
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur);
    window.addEventListener('pointercancel', cancel); window.addEventListener('touchcancel', cancel);
    back(this, () => { if (this.paused) { this.sheet?.close(); this.scene.start('MainMenu'); } else this.pause(); });
    this.events.once('shutdown', () => {
      off(); this.sheet?.close(); this.clearInput();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('touchcancel', cancel);
      this.input.keyboard?.off('keydown-SPACE', keydown); this.input.keyboard?.removeCapture('SPACE');
      this.input.keyboard?.removeAllKeys(true);
    });
    if (this.world.training) this.startTutorial(); else (this.registry.get('session') as Session).start();
    this.paint();
  }
  private tap() { if (!this.paused && !this.resultSent) queueTap(this.world); }
  private clearInput() { this.world.pendingTap = false; this.spaceReleased = false; }
  private startTutorial() {
    this.header.setMetricsVisible(false); this.count.setVisible(false); this.target.setVisible(false);
    this.tutorial = runFirstMoveTutorial(this, { locale: this.loc, text: t(this.loc, 'tutorial.firstMove'),
      targets: () => [{ x: COURT_X, y: COURT_Y, w: WIDTH, h: HEIGHT }], veilAlpha: 0.25, barTop: () => 70,
      onDone: () => {
        if (!this.scene.isActive() || !this.world.training) return;
        this.registry.set('hoopsTaught', true); this.world = createCourt(this.world.seed); this.clearInput();
        this.message = ''; this.messageUntil = 0;
        this.header.setMetricsVisible(true); this.count.setVisible(true); this.target.setVisible(true);
        (this.registry.get('session') as Session).start(); this.paint();
      },
    });
  }
  private pause() {
    if (this.paused || this.resultSent) return;
    this.paused = true; this.clearInput();
    this.sheet = openPauseSheet(this, { locale: this.loc, kind: 'run',
      summary: t(this.loc, 'pause.summary', { n: this.world.baskets }),
      sound: { on: t(this.loc, 'sound.on'), off: t(this.loc, 'sound.off') },
      onResume: () => {
        this.sheet = null;
        if (this.hostPaused || document.hidden) { this.paused = false; this.pause(); return; }
        this.clearInput(); this.paused = false;
      }, onRestart: () => this.scene.restart(), onExit: () => this.scene.start('MainMenu'),
      onHowto: () => this.scene.restart({ tutorial: true }),
    });
  }
  update(_time: number, delta: number) {
    if (!this.space?.isDown) this.spaceReleased = true;
    if (this.paused || this.resultSent) return;
    const events = advance(this.world, delta);
    for (const event of events) {
      if (event.type === 'clean' || event.type === 'basket') {
        playSound('ok'); this.message = t(this.loc, event.type === 'clean' ? 'game.clean' : 'game.hit');
        this.messageUntil = this.world.elapsedMs + 1000;
      }
      if (event.type === 'reset') { this.message = t(this.loc, 'game.reset'); this.messageUntil = this.world.elapsedMs + 1000; }
    }
    if (this.world.training && this.world.baskets > 0) this.tutorial?.done();
    this.paint();
    if (this.world.ended) {
      this.endGame();
    }
  }
  endGame() {
    if (this.resultSent) return;
    this.world.ended ??= 'time'; this.resultSent = true; this.clearInput();
    (this.registry.get('session') as Session).finish(this.world);
    this.scene.start('GameOver', { world: this.world });
  }
  private paint() {
    const w = this.world, chips = [String(w.score), `0:${String(Math.ceil(w.remainingMs / 1000)).padStart(2, '0')}`];
    if (chips.join('|') !== this.headerSignature) { this.headerSignature = chips.join('|'); this.header.setChips(chips); }
    this.count.setText(t(this.loc, 'game.baskets', { n: w.baskets }));
    basket(this.basketBack, this.basketFront, w);
    this.ball.root.setPosition(COURT_X + w.ball.x, COURT_Y + w.ball.y);
    this.ball.ball.setRotation(motionAllowed() ? w.ball.x / 28 : 0);
    const pulse = motionAllowed() ? Math.max(0, w.tapCooldown / 110) : 0;
    this.ball.root.setScale(1 + pulse * 0.08, 1 - pulse * 0.06);
    this.trail.clear();
    if (motionAllowed()) this.trail.lineStyle(5, C.primarySoft, 0.25)
      .lineBetween(w.ball.x - w.ball.vx * 0.05, w.ball.y - w.ball.vy * 0.05, w.ball.x, w.ball.y);
    this.hint.setText(w.training ? t(this.loc, 'tutorial.note')
      : this.messageUntil > w.elapsedMs ? this.message : t(this.loc, w.taps === 0 ? 'game.hint' : 'game.timeBonus'));
  }
}
export class GameOver extends Scene {
  constructor() { super('GameOver'); }
  create({ world }: { world: Court }) {
    prepare(this); const loc = locale(this), menu = () => this.scene.start('MainMenu');
    createGameHeader(this, { title: t(loc, 'app.title'), onBack: menu, chips: [] }); back(this, menu);
    const metrics = { baskets: world.baskets, cleanBaskets: world.cleanBaskets, bestCleanStreak: world.bestCleanStreak };
    const result = recordPilotRound({ slug: SLUG, defs: CHALLENGES, metrics, score: world.score });
    playSound(world.baskets > 0 ? 'win' : 'lose');
    text(this, 200, 78, t(loc, 'prototype'), 11, S.muted);
    text(this, 200, 140, t(loc, `result.${world.ended}`), 26);
    text(this, 200, 206, t(loc, 'result.score', { n: world.score }), 38);
    text(this, 200, 252, t(loc, 'result.stats', { baskets: world.baskets, clean: world.cleanBaskets }), 14, S.muted);
    if (result.records.improved.includes('score')) text(this, 200, 291, t(loc, 'result.record'), 15, S.accent);
    if (result.closed.length) text(this, 200, 329, t(loc, 'result.closed', { n: result.closed.length }), 16, S.success);
    const active = challengeStates(SLUG, CHALLENGES).find(c => c.active);
    if (active) {
      this.add.graphics().fillStyle(C.surface).fillRoundedRect(26, 355, 348, 90, 12)
        .lineStyle(2, C.primary).strokeRoundedRect(26, 355, 348, 90, 12);
      text(this, 200, 399, t(loc, 'result.near', { text: challengeText(loc, active),
        value: Math.min(active.target, metrics[active.metric as keyof typeof metrics] ?? 0), target: active.target }), 15);
    }
    text(this, 200, 487, t(loc, 'result.notice'), 13, S.muted);
    makeButton(this, 200, 554, t(loc, 'result.retry'), () => this.scene.start('Game'), { height: 48, primary: true });
    makeButton(this, 200, 612, t(loc, 'result.menu'), menu, { height: 44 });
  }
}
