import { AUTO, Game as PhaserGame, Scale } from 'phaser';
import { C, DPR, VIEW_H, installAudioUnlock, preferredLocale } from '@gamewingo/game-ui';
import { createSession } from './bridge/session';
import { Boot, MainMenu, Game, GameOver } from './game/scenes';
installAudioUnlock();
const game = new PhaserGame({ type: AUTO, parent: 'game-container', backgroundColor: C.bg,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH, width: 400 * DPR, height: VIEW_H * DPR },
  input: { activePointers: 2 }, render: { antialias: true }, scene: [Boot, MainMenu, Game, GameOver],
  callbacks: { preBoot(g) { g.registry.set('session', createSession(preferredLocale())); } },
});
const fatal = (event: ErrorEvent) => game.registry.get('session')?.bridge.error(event.message);
window.addEventListener('error', fatal);
game.events.once('destroy', () => { window.removeEventListener('error', fatal); game.registry.get('session')?.destroy(); });
if (import.meta.env.DEV) (window as unknown as { __tapHoops: PhaserGame }).__tapHoops = game;
