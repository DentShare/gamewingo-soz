import { AUTO, Game as PhaserGame, Scale } from 'phaser';
import { Boot } from './scenes/Boot';
import { MainMenu } from './scenes/MainMenu';
import { Game } from './scenes/Game';
import { GameOver } from './scenes/GameOver';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#fbebe1',
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
    width: 400,
    height: 720,
  },
  scene: [Boot, MainMenu, Game, GameOver],
};

const StartGame = (parent: string) => {
  const game = new PhaserGame({ ...config, parent });
  if (import.meta.env.DEV) {
    (window as unknown as { __fifteen?: PhaserGame }).__fifteen = game;
  }
  return game;
};

export default StartGame;
