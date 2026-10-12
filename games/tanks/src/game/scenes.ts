import { Scene, Input, type GameObjects, type Tweens } from 'phaser';
import {
  C, S, FONT, DPR, VIEW_TOP, VIEW_BOTTOM, setupCamera, applyTheme, makeButton,
  createGameHeader, openPauseSheet, guardBrowserBack, runFirstMoveTutorial,
  makeChallengeList, makeRecordBadge, playSound, motionAllowed,
  type FirstMoveTutorial,
} from '@gamewingo/game-ui';
import { challengeStates, loadBests } from '@gamewingo/game-progress';
import { recordPilotRound } from '../core/progress';
import { advance, createArena, activatePower, choosePower, MAX_MS, VECTORS,
  type Arena, type ArenaEvent, type Direction } from '../core/arena';
import { TouchControls } from '../core/controls';
import { CHALLENGES } from '../core/challenges';
import { t, type Locale } from '../i18n';
import type { Session } from '../bridge/session';
import { ARENA_X, ARENA_Y, floor, walls, core, tankView, syncTank, powerIcon, type TankView } from './painters';

const SLUG = 'tanks';
function locale(scene: Scene): Locale { return scene.registry.get('locale') ?? 'ru'; }
function label(scene: Scene, x: number, y: number, text: string, size = 15, color: string = S.ink) {
  return scene.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color, align: 'center',
    wordWrap: { width: 350 } }).setOrigin(0.5).setResolution(DPR);
}
function prepare(scene: Scene) { setupCamera(scene); applyTheme(scene); }
function timer(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function challengeText(loc: Locale, challenge: typeof CHALLENGES[number]) {
  return t(loc, `challenge.${challenge.id}`, { n: challenge.target });
}
function back(scene: Scene, callback: () => void) {
  const off = guardBrowserBack(callback);
  scene.events.once('shutdown', off);
}

export class Boot extends Scene {
  constructor() { super('Boot'); }
  create() {
    prepare(this);
    const session: Session = this.registry.get('session');
    let proceeded = false;
    const proceed = () => {
      if (proceeded) return;
      proceeded = true;
      this.registry.set('locale', session.locale);
      this.scene.start('MainMenu');
    };
    const off = session.bridge.onApp(e => {
      if (e.type !== 'INIT') return;
      session.applyInit(e);
      this.registry.set('locale', session.locale);
      this.registry.set('theme', e.theme ?? null);
      proceed();
    });
    this.game.events.once('destroy', off);
    session.bridge.ready();
    this.time.delayedCall(400, proceed);
  }
}

export class MainMenu extends Scene {
  constructor() { super('MainMenu'); }
  create() {
    prepare(this);
    const loc = locale(this);
    const exit = () => {
      const session: Session = this.registry.get('session');
      session.exit();
      if (!session.hosted) window.location.assign('../');
    };
    createGameHeader(this, { title: t(loc, 'app.title'), onBack: exit, chips: [] });
    back(this, exit);
    label(this, 200, 78, t(loc, 'prototype'), 11, S.muted);
    const icon = tankView(this);
    syncTank(icon, createArena().player, 0);
    icon.root.setPosition(200, 145).setScale(2.1);
    label(this, 200, 198, t(loc, 'menu.subtitle'), 22);
    label(this, 200, 242, t(loc, 'menu.description'), 14, S.muted);
    makeRecordBadge(this, 200, 300, { label: t(loc, 'menu.record'), value: String(loadBests(SLUG).score ?? 0) });
    const states = challengeStates(SLUG, CHALLENGES);
    const list = makeChallengeList(this, 200, 351, {
      header: t(loc, 'menu.challenges', { k: states.filter(s => s.done).length, n: CHALLENGES.length }),
      rows: states.map(s => ({ ...s, text: challengeText(loc, s) })),
    });
    const buttonY = Math.min(351 + list.height + 34, VIEW_BOTTOM - 112);
    makeButton(this, 200, buttonY, t(loc, 'menu.play'), () => this.scene.start('Game'), { primary: true, height: 48 });
    for (const [i, lang] of (['ru', 'uz'] as const).entries()) {
      makeButton(this, 166 + i * 68, buttonY + 58, lang.toUpperCase(), () => {
        this.registry.set('locale', lang);
        this.scene.restart();
      }, { width: 60, height: 44, primary: lang === loc });
    }
  }
}

export class Game extends Scene {
  world!: Arena;
  private loc: Locale = 'ru';
  private touches = new TouchControls();
  private keys: Record<string, Input.Keyboard.Key> = {};
  private releasedKeys = false;
  private paused = false;
  private hostPaused = false;
  private resultSent = false;
  private pendingFire = false;
  private tutorial: FirstMoveTutorial | null = null;
  private sheet: ReturnType<typeof openPauseSheet> | null = null;
  private header!: ReturnType<typeof createGameHeader>;
  private waveLabel!: GameObjects.Text;
  private hint!: GameObjects.Text;
  private health!: GameObjects.Graphics;
  private wallLayer!: GameObjects.Graphics;
  private coreLayer!: GameObjects.Graphics;
  private projectiles!: GameObjects.Graphics;
  private spawnLayer!: GameObjects.Graphics;
  private stickKnob!: GameObjects.Arc;
  private fireFace!: GameObjects.Arc;
  private powerButton!: ReturnType<typeof makeButton>;
  private powerGlyph!: GameObjects.Graphics;
  private powerLabel!: GameObjects.Text;
  private powerTime!: GameObjects.Text;
  private choice: GameObjects.Container | null = null;
  private views = new Map<number, TankView>();
  private effectTweens = new Set<Tweens.Tween>();
  private wallSignature = '';
  private headerSignature = '';

  constructor() { super('Game'); }
  create(data: { tutorial?: boolean } = {}) {
    prepare(this);
    this.loc = locale(this);
    this.touches = new TouchControls();
    this.paused = false; this.hostPaused = false; this.resultSent = false; this.pendingFire = false;
    this.sheet = null; this.tutorial = null; this.views = new Map(); this.effectTweens = new Set(); this.wallSignature = '';
    this.choice = null;
    this.headerSignature = '';
    this.world = createArena(Date.now() >>> 0, data.tutorial || !this.registry.get('tanksTaught'));
    this.header = createGameHeader(this, { title: t(this.loc, 'app.title'),
      onBack: () => this.pause(), chips: ['0', '3:00'] });
    label(this, 73, 77, t(this.loc, 'game.armor'), 12, S.muted);
    label(this, 260, 77, t(this.loc, 'game.core'), 12, S.muted);
    this.health = this.add.graphics();
    this.waveLabel = label(this, 200, 102, '', 15);
    const next = challengeStates(SLUG, CHALLENGES).find(c => c.active);
    label(this, 200, 121, next ? t(this.loc, 'game.target', { n: next.n, text: challengeText(this.loc, next) })
      : t(this.loc, 'game.allDone'), 11, S.muted);
    floor(this);
    this.wallLayer = this.add.graphics().setPosition(ARENA_X, ARENA_Y);
    this.coreLayer = this.add.graphics().setPosition(ARENA_X, ARENA_Y);
    this.spawnLayer = this.add.graphics().setPosition(ARENA_X, ARENA_Y);
    this.projectiles = this.add.graphics().setPosition(ARENA_X, ARENA_Y).setDepth(20);
    this.hint = label(this, 200, 549, t(this.loc, 'tutorial.move'), 12, S.muted);
    this.createControls();
    this.installLifecycle();
    this.paint();
    if (this.world.training) this.startTutorial();
    else (this.registry.get('session') as Session).start();
  }

  private createControls() {
    this.add.circle(97, 620, 57, C.surface).setStrokeStyle(1, C.divider);
    const arrows = this.add.graphics().lineStyle(2, C.muted, 0.6);
    arrows.lineBetween(97, 575, 97, 588).lineBetween(97, 652, 97, 665)
      .lineBetween(52, 620, 65, 620).lineBetween(129, 620, 142, 620);
    this.stickKnob = this.add.circle(97, 620, 27, C.accent).setStrokeStyle(3, C.accentSoft);
    this.fireFace = this.add.circle(303, 620, 48, C.primary).setStrokeStyle(5, C.tint);
    const cross = this.add.graphics().lineStyle(2, C.white);
    cross.strokeCircle(303, 614, 13).lineBetween(303, 594, 303, 605)
      .lineBetween(303, 623, 303, 634).lineBetween(283, 614, 294, 614).lineBetween(312, 614, 323, 614);
    label(this, 97, 690, t(this.loc, 'game.move'), 12, S.muted);
    label(this, 303, 648, t(this.loc, 'game.fire'), 12, S.white);
    label(this, 200, 713, t(this.loc, 'game.keyboard'), 10, S.muted);
    this.powerButton = makeButton(this, 200, 620, '', () => this.usePower(), { width: 68, height: 64 });
    this.powerGlyph = this.add.graphics().setPosition(0, -3);
    this.powerTime = label(this, 0, 22, '', 10, S.accent);
    this.powerButton.root.add([this.powerGlyph, this.powerTime]);
    this.powerLabel = label(this, 200, 690, '', 11, S.muted).setWordWrapWidth(94);
    const stick = this.add.rectangle(97, 620, 130, 130, C.white, 0).setInteractive();
    const fire = this.add.circle(303, 620, 54, C.white, 0).setInteractive();
    stick.on('pointerdown', (p: Input.Pointer) => {
      if (this.paused || this.world.choicePending) return;
      this.touches.startStick(p.id); this.movePointer(p);
    });
    fire.on('pointerdown', (p: Input.Pointer) => {
      if (!this.paused && !this.world.choicePending) { this.touches.startFire(p.id); this.pendingFire = this.touches.fire === p.id; }
    });
    const move = (p: Input.Pointer) => this.movePointer(p);
    const release = (p: Input.Pointer) => this.touches.release(p.id);
    this.input.on('pointermove', move);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', () => this.clearInput());
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,E') as typeof this.keys ?? {};
    this.input.keyboard?.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.events.once('shutdown', () => {
      this.input.off('pointermove', move); this.input.off('pointerup', release); this.input.off('pointerupoutside', release);
      this.input.off('gameout'); this.input.keyboard?.removeCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
      this.input.keyboard?.removeAllKeys(true); this.clearInput();
    });
  }
  private movePointer(p: Input.Pointer) {
    if (this.paused || this.world.choicePending) return;
    const point = this.cameras.main.getWorldPoint(p.x, p.y);
    this.touches.move(p.id, point.x - 97, point.y - 620);
  }
  private clearInput() {
    this.touches.clear(); this.releasedKeys = false; this.pendingFire = false;
    this.stickKnob?.setPosition(97, 620); this.fireFace?.setFillStyle(C.primary);
  }
  private direction(): Direction | null {
    if (this.touches.direction) return this.touches.direction;
    if (!this.releasedKeys) return null;
    for (const [direction, keys] of [
      ['up', ['W', 'UP']], ['down', ['S', 'DOWN']], ['left', ['A', 'LEFT']], ['right', ['D', 'RIGHT']],
    ] as const) if (keys.some(key => this.keys[key]?.isDown)) return direction;
    return null;
  }
  private installLifecycle() {
    back(this, () => {
      if (this.paused) { this.sheet?.close(); this.scene.start('MainMenu'); }
      else this.pause();
    });
    const off = (this.registry.get('session') as Session).bridge.onApp(e => {
      if (e.type === 'PAUSE') { this.hostPaused = true; this.pause(); }
      if (e.type === 'RESUME') this.hostPaused = false;
    });
    const visibility = () => { if (document.hidden) this.pause(); };
    const blur = () => this.pause();
    const cancel = () => this.clearInput();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchcancel', cancel);
    this.events.once('shutdown', () => {
      off(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('touchcancel', cancel);
      this.sheet?.close();
      for (const tween of this.effectTweens) tween.remove();
      this.effectTweens.clear();
    });
  }
  private startTutorial() {
    this.header.setMetricsVisible(false);
    this.tutorial = runFirstMoveTutorial(this, {
      locale: this.loc, text: t(this.loc, 'tutorial.firstMove'),
      targets: () => [{ x: 254, y: 571, w: 98, h: 98 }, { x: 184, y: 378, w: 32, h: 32 }],
      veilAlpha: 0.3, barTop: () => 70,
      onDone: () => {
        if (!this.scene.isActive() || !this.world.training) return;
        this.registry.set('tanksTaught', true);
        this.world = createArena(this.world.seed);
        this.clearInput(); this.header.setMetricsVisible(true);
        (this.registry.get('session') as Session).start();
        this.hint.setText(t(this.loc, 'tutorial.move'));
        this.paint();
      },
    });
    this.hint.setText(t(this.loc, 'tutorial.note'));
  }
  private pause() {
    if (this.paused || this.resultSent) return;
    this.paused = true; this.clearInput();
    for (const tween of this.effectTweens) tween.pause();
    this.sheet = openPauseSheet(this, {
      locale: this.loc, kind: 'run', summary: t(this.loc, 'pause.summary', { n: this.world.wave }),
      sound: { on: t(this.loc, 'sound.on'), off: t(this.loc, 'sound.off') },
      onResume: () => {
        this.sheet = null;
        if (this.hostPaused || document.hidden) { this.paused = false; this.pause(); return; }
        this.clearInput(); this.paused = false;
        if (!this.world.choicePending) for (const tween of this.effectTweens) tween.resume();
      },
      onRestart: () => this.scene.restart(), onExit: () => this.scene.start('MainMenu'),
      onHowto: () => this.scene.restart({ tutorial: true }),
    });
  }
  private usePower() {
    if (this.paused || this.resultSent || !activatePower(this.world)) return;
    playSound('ok'); this.paint();
  }
  private showPowerChoice() {
    if (this.choice || !this.world.choicePending) return;
    this.clearInput();
    for (const tween of this.effectTweens) tween.pause();
    // Below the shared header and pause sheet: Back still opens the normal pause.
    const root = this.choice = this.add.container(0, 0).setDepth(150);
    root.add(this.add.rectangle(200, (VIEW_TOP + VIEW_BOTTOM) / 2, 400,
      VIEW_BOTTOM - VIEW_TOP, C.ink, 0.55).setInteractive());
    root.add(this.add.graphics().fillStyle(C.bg).fillRoundedRect(24, 180, 352, 400, 20));
    root.add(label(this, 200, 215, t(this.loc, 'power.choose'), 23));
    root.add(label(this, 200, 248, t(this.loc, 'power.paused'), 12, S.muted));
    for (const [index, power] of (['repair', 'shield'] as const).entries()) {
      const y = 292 + index * 110;
      const icon = this.add.graphics().setPosition(64, y + 6);
      powerIcon(icon, power, C.accentDark); root.add(icon);
      root.add(label(this, 220, y, t(this.loc, `power.${power}.description`), 13).setWordWrapWidth(245));
      const button = makeButton(this, 200, y + 43, t(this.loc, `power.${power}.take`), () => {
        if (this.paused || this.hostPaused || !choosePower(this.world, power)) return;
        this.choice?.destroy(); this.choice = null; this.clearInput();
        for (const tween of this.effectTweens) tween.resume();
        this.paint();
      }, { width: 304, height: 44, primary: true });
      root.add(button.root);
    }
    root.add(label(this, 200, 488, t(this.loc, 'power.activation'), 12, S.muted).setWordWrapWidth(310));
    root.add(label(this, 200, 523, this.world.power
      ? t(this.loc, 'power.replace', { name: t(this.loc, `power.${this.world.power}`) })
      : t(this.loc, 'power.battleOnly'), 11, S.muted).setWordWrapWidth(310));
    root.add(label(this, 200, 556, t(this.loc, 'power.flanker'), 11, S.ink).setWordWrapWidth(310));
  }
  update(_time: number, delta: number) {
    // After a pause a held physical key must be released before it can move/fire again.
    if (Object.values(this.keys).every(k => !k.isDown)) this.releasedKeys = true;
    if (this.paused || this.resultSent) { this.stickKnob?.setPosition(97, 620); return; }
    if (this.keys.E && Input.Keyboard.JustDown(this.keys.E) && this.releasedKeys) this.usePower();
    const events = advance(this.world, { direction: this.direction(),
      fire: this.pendingFire || this.touches.fire !== null || (this.releasedKeys && !!this.keys.SPACE?.isDown) }, delta);
    if (this.world.player.cooldown > 0) this.pendingFire = false;
    this.effects(events);
    if (this.world.training && this.world.kills > 0) this.tutorial?.done();
    this.paint();
    if (this.world.choicePending) this.showPowerChoice();
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
    const chips = [String(this.world.score), timer(MAX_MS - this.world.elapsedMs)];
    const headerSignature = chips.join('|');
    // Header layout rebuilds text textures. Update on a changed value, not 60x/s.
    if (headerSignature !== this.headerSignature) {
      this.header.setChips(chips); this.headerSignature = headerSignature;
    }
    this.waveLabel.setText(t(this.loc, 'game.wave', { n: this.world.wave }));
    const hp = this.health.clear();
    for (let i = 0; i < 3; i++) {
      hp.fillStyle(i < this.world.player.hp ? C.accent : C.divider).fillRoundedRect(110 + i * 15, 71, 11, 11, 3);
      hp.fillStyle(i < this.world.core.hp ? C.primary : C.divider).fillRoundedRect(293 + i * 15, 71, 11, 11, 3);
    }
    const signature = this.world.tiles.join('');
    if (signature !== this.wallSignature) { walls(this.wallLayer, this.world); this.wallSignature = signature; }
    core(this.coreLayer, this.world);
    const tanks = [this.world.player, ...this.world.bots];
    for (const [id, view] of this.views) if (!tanks.some(tank => tank.id === id)) { view.root.destroy(); this.views.delete(id); }
    for (const tank of tanks) {
      if (!this.views.has(tank.id)) this.views.set(tank.id, tankView(this, tank.id !== 0,
        tank.hp > 1 && tank.id !== 0, tank.route !== 'direct'));
      syncTank(this.views.get(tank.id)!, tank, this.world.elapsedMs, tank.id === 0 && this.world.powerShieldMs > 0);
    }
    const g = this.projectiles.clear();
    for (const bullet of this.world.bullets) {
      const v = VECTORS[bullet.direction];
      g.lineStyle(3, bullet.enemy ? C.primarySoft : C.accentSoft, 0.6)
        .lineBetween(bullet.x - v.x * 6, bullet.y - v.y * 6, bullet.x, bullet.y);
      g.fillStyle(bullet.enemy ? C.primary : C.accentDark).fillCircle(bullet.x, bullet.y, 3);
    }
    const spawns = this.spawnLayer.clear();
    for (const spawn of this.world.spawns) {
      spawns.lineStyle(2, C.primary, 0.8).strokeRoundedRect(spawn.x - 12, spawn.y - 12, 24, 24, 5);
      spawns.lineBetween(spawn.x - 6, spawn.y, spawn.x + 6, spawn.y)
        .lineBetween(spawn.x, spawn.y - 6, spawn.x, spawn.y + 6);
    }
    this.stickKnob.setPosition(97 + this.touches.dx, 620 + this.touches.dy);
    this.fireFace.setFillStyle(this.touches.fire !== null ? C.primaryPressed : C.primary);
    const activeShield = this.world.powerShieldMs > 0;
    powerIcon(this.powerGlyph, activeShield ? 'shield' : this.world.power, activeShield || this.world.power ? C.accentDark : C.divider);
    this.powerTime.setText(activeShield ? t(this.loc, 'power.seconds', { n: Math.ceil(this.world.powerShieldMs / 1000) }) : '');
    this.powerLabel.setText(activeShield ? t(this.loc, 'power.active') : this.world.power === 'repair' && this.world.player.hp >= 3
      ? t(this.loc, 'power.full') : this.world.power ? t(this.loc, `power.${this.world.power}`) : t(this.loc, 'power.empty'));
    this.powerButton.root.setAlpha(activeShield || this.world.power ? 1 : 0.5);
    if (!this.world.training) this.hint.setText(this.world.intermission > 0 ? t(this.loc, 'game.cleared')
      : this.world.spawns.length > 0 ? t(this.loc, 'game.ready') : t(this.loc, 'tutorial.move'));
  }
  private effects(events: ArenaEvent[]) {
    for (const event of events) {
      if (event.type === 'kill' || event.type === 'wave') playSound('ok');
      if (event.type === 'damage' || event.type === 'core') playSound('wrong');
      if (!motionAllowed() || event.type === 'shot' || event.type === 'wave') continue;
      const ring = this.add.circle(ARENA_X + event.x, ARENA_Y + event.y, 7, event.type === 'kill' ? C.primary : C.accent, 0.5).setDepth(30);
      const tween = this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 180,
        onComplete: () => { ring.destroy(); this.effectTweens.delete(tween); } });
      this.effectTweens.add(tween);
    }
  }
}

export class GameOver extends Scene {
  constructor() { super('GameOver'); }
  create({ world }: { world: Arena }) {
    prepare(this);
    const loc = locale(this), menu = () => this.scene.start('MainMenu');
    createGameHeader(this, { title: t(loc, 'app.title'), onBack: menu, chips: [] }); back(this, menu);
    const metrics = { kills: world.kills, waves: world.waves, bestNoDamageStreak: world.bestNoDamageStreak, score: world.score };
    const result = recordPilotRound({ slug: SLUG, defs: CHALLENGES, metrics, score: world.score });
    playSound(world.ended === 'victory' ? 'win' : 'lose');
    label(this, 200, 90, t(loc, 'prototype'), 11, S.muted);
    label(this, 200, 138, t(loc, `result.${world.ended}`), 26);
    label(this, 200, 200, t(loc, 'result.score', { n: world.score }), 38);
    label(this, 200, 245, t(loc, 'result.stats', { kills: world.kills, waves: world.waves, time: timer(world.elapsedMs) }), 14, S.muted);
    if (result.records.improved.includes('score')) label(this, 200, 285, t(loc, 'result.record'), 15, S.accent);
    if (result.closed.length) label(this, 200, 327, t(loc, 'result.closed', { n: result.closed.length }), 17, S.success);
    const active = challengeStates(SLUG, CHALLENGES).find(c => c.active);
    if (active) {
      this.add.graphics().fillStyle(C.surface).fillRoundedRect(26, 355, 348, 90, 12)
        .lineStyle(2, C.primary).strokeRoundedRect(26, 355, 348, 90, 12);
      label(this, 200, 397, t(loc, 'result.near', { text: challengeText(loc, active),
        value: Math.min(active.target, metrics[active.metric as keyof typeof metrics] ?? 0), target: active.target }), 15);
    }
    label(this, 200, 488, t(loc, 'result.notice'), 13, S.muted);
    makeButton(this, 200, 558, t(loc, 'result.retry'), () => this.scene.start('Game'), { primary: true, height: 48 });
    makeButton(this, 200, 614, t(loc, 'result.menu'), menu, { height: 44 });
  }
}
