import { AUTO, Game as PhaserGame, Scale } from 'phaser';
import { C, DPR, VIEW_H, installAudioUnlock, preferredLocale } from '@gamewingo/game-ui';
import { createSession } from './bridge/session';
import { Boot, MainMenu, Game, GameOver } from './game/scenes';

installAudioUnlock();
const game = new PhaserGame({
  type: AUTO, parent: 'game-container', backgroundColor: C.bg,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH, width: 400 * DPR, height: VIEW_H * DPR },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  scene: [Boot, MainMenu, Game, GameOver],
  callbacks: { preBoot(g) { g.registry.set('session', createSession(preferredLocale())); } },
});
game.events.once('destroy', () => game.registry.get('session')?.destroy());
if (import.meta.env.DEV) (window as unknown as { __tanks: PhaserGame }).__tanks = game;
