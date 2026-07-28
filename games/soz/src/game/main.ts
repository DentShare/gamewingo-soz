import { AUTO, Game as PhaserGame, Scale } from 'phaser';
import { Boot } from './scenes/Boot';
import { MainMenu } from './scenes/MainMenu';
import { Game } from './scenes/Game';
import { GameOver } from './scenes/GameOver';
import { DPR, LOGICAL_W, LOGICAL_H } from './dpr';

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  backgroundColor: '#fbebe1',
  // Холст в DPR раз плотнее логических 400×720 → чёткий рендер на retina.
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
    width: LOGICAL_W * DPR,
    height: LOGICAL_H * DPR,
    autoRound: true,
  },
  render: { antialias: true, roundPixels: true },
  scene: [Boot, MainMenu, Game, GameOver],
};

const StartGame = (parent: string) => {
  const game = new PhaserGame({ ...config, parent });
  if (import.meta.env.DEV) {
    (window as unknown as { __soz?: PhaserGame }).__soz = game;
  }
  return game;
};

export default StartGame;
