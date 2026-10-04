import type { Scene } from 'phaser';
import { C, S, FONT, TOP_BAR_H } from './tokens.js';
import { DPR, VIEW_TOP, VIEW_BOTTOM, VIEW_H } from './viewport.js';
import { makeButton } from './widgets.js';
import { isMuted, setMuted, playSound } from './audio.js';

/** Опциональная шапка партии; старые игры не меняются до подключения. */
export function createGameHeader(scene: Scene, options: { title: string; onBack: () => void; chips: readonly string[] }) {
  const root = scene.add.container(0, 0).setDepth(200);
  const bar = scene.add.graphics().fillGradientStyle(C.topBarLeft, C.topBarRight, C.topBarLeft, C.topBarRight, 1)
    .fillRect(0, VIEW_TOP, 400, TOP_BAR_H - VIEW_TOP);
  const arrow = scene.add.graphics().lineStyle(2, C.white).beginPath();
  arrow.moveTo(41, 20).lineTo(33, 28).lineTo(41, 36).strokePath();
  const heading = scene.add.text(200, 28, options.title, { fontFamily: FONT, fontSize: 20, fontStyle: '600', color: S.white }).setOrigin(0.5).setResolution(DPR);
  const hit = scene.add.rectangle(36, 28, 48, 48, C.white, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerup', () => { playSound('tap'); options.onBack(); });
  const metrics = scene.add.container(0, 28);
  const backgrounds = options.chips.map(() => scene.add.graphics());
  const texts = options.chips.map((text) => scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: 13, fontStyle: '700', color: S.white }).setOrigin(0.5).setResolution(DPR));
  metrics.add([...backgrounds, ...texts]);
  root.add([bar, arrow, heading, hit, metrics]);
  const layout = () => {
    let right = 386;
    for (let i = texts.length - 1; i >= 0; i--) {
      const width = Math.max(48, texts[i].width + 20);
      texts[i].setX(right - width / 2);
      backgrounds[i].clear().fillStyle(C.white, 0.22).fillRoundedRect(right - width, -13, width, 26, 13);
      right -= width + 6;
    }
    const available = (metrics.visible && texts.length ? right - 8 : 344) - 56;
    heading.setFontSize(20).setX(56 + available / 2);
    if (heading.width > available) heading.setFontSize(Math.max(14, 20 * available / heading.width));
  };
  layout();
  return { root,
    setChips(values: readonly string[]) { texts.forEach((text, i) => text.setText(values[i] ?? '')); layout(); },
    setMetricsVisible(visible: boolean) { metrics.setVisible(visible); layout(); },
    destroy() { root.destroy(); },
  };
}

export interface PauseLabels { title: string; resume: string; restart: string; exit: string; soundOn: string; soundOff: string; howto: string; }
/** Шит остаётся интерактивным даже когда время и твины партии остановлены. */
export function openPourPauseSheet(scene: Scene, options: { labels: PauseLabels; summary: string; onResume: () => void; onRestart: () => void; onExit: () => void; onHowto: () => void }) {
  const root = scene.add.container(0, 0).setDepth(1000);
  const blocker = scene.add.rectangle(200, VIEW_TOP + VIEW_H / 2, 400, VIEW_H, C.ink, 0.5).setInteractive();
  const top = VIEW_BOTTOM - 360;
  const panel = scene.add.graphics().fillStyle(C.bg).fillRoundedRect(0, top, 400, 380, { tl: 20, tr: 20, bl: 0, br: 0 });
  const handle = scene.add.graphics().fillStyle(C.divider).fillRoundedRect(182, top + 14, 36, 4, 2);
  const title = scene.add.text(200, top + 45, options.labels.title, { fontFamily: FONT, fontSize: 20, fontStyle: '700', color: S.ink }).setOrigin(0.5).setResolution(DPR);
  const summary = scene.add.text(200, top + 80, options.summary, { fontFamily: FONT, fontSize: 13, color: S.muted, align: 'center', wordWrap: { width: 350 } }).setOrigin(0.5).setResolution(DPR);
  root.add([blocker, panel, handle, title, summary]);
  const addButton = (y: number, label: string, callback: () => void, primary = false, danger = false) => {
    const button = makeButton(scene, 200, top + y, label, callback, { width: 360, height: primary ? 48 : 44, primary, textColor: danger ? S.danger : undefined, fontSize: danger ? 13 : 15 });
    root.add(button.root);
  };
  addButton(135, options.labels.resume, options.onResume, true);
  addButton(193, options.labels.restart, options.onRestart);
  addButton(245, options.labels.exit, options.onExit, false, true);
  const soundLabel = () => isMuted() ? options.labels.soundOff : options.labels.soundOn;
  const sound = makeButton(scene, 106, top + 307, soundLabel(), () => {
    setMuted(!isMuted()); sound.setLabel(soundLabel());
  }, { width: 172, height: 44, fontSize: 13 });
  const howto = makeButton(scene, 294, top + 307, options.labels.howto, options.onHowto, { width: 172, height: 44, fontSize: 13 });
  root.add([sound.root, howto.root]);
  return { root, setSummary(text: string) { summary.setText(text); }, destroy() { root.destroy(); } };
}

type TutorialTarget = { root: Phaser.GameObjects.Container; outline: Phaser.GameObjects.Graphics };
export function runPourTutorial(scene: Scene, options: { allTargets: readonly TutorialTarget[]; targets: readonly TutorialTarget[]; hint: string; skip: string; onDone: () => void }) {
  const root = scene.add.container(0, 0).setDepth(250);
  const panel = scene.add.graphics().fillStyle(C.ink, 0.94).fillRoundedRect(20, 652, 360, 66, 12);
  const label = scene.add.text(32, 665, options.hint, { fontFamily: FONT, fontSize: 13, color: S.white, wordWrap: { width: 225 }, lineSpacing: 2 }).setResolution(DPR);
  const skip = makeButton(scene, 322, 685, options.skip, () => complete(), { width: 100, height: 44, fontSize: 12 });
  root.add([panel, label, skip.root]);
  let active = true;
  let pulses: Phaser.Tweens.Tween[] = [];
  const focus = (targets: readonly TutorialTarget[], hint: string) => {
    pulses.forEach((tween) => tween.remove()); pulses = [];
    label.setText(hint);
    options.allTargets.forEach((target) => {
      target.root.setAlpha(targets.includes(target) ? 1 : 0.35);
      target.outline.setAlpha(0);
    });
    targets.forEach((target) => {
      target.outline.setAlpha(1);
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) pulses.push(scene.tweens.add({ targets: target.outline, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 }));
    });
  };
  const cleanup = () => {
    pulses.forEach((tween) => tween.remove()); pulses = [];
    options.allTargets.forEach((target) => { target.root.setAlpha(1); target.outline.setAlpha(0); });
    root.destroy();
  };
  const complete = () => { if (!active) return; active = false; cleanup(); options.onDone(); };
  focus(options.targets, options.hint);
  return { root, setTargets: focus, complete, destroy() { if (active) { active = false; cleanup(); } } };
}
