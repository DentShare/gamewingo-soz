import StartGame from './game/main';

// Шрифт каталога — системный (docs/DESIGN.md), поэтому ждать загрузки веб-шрифта
// перед стартом Phaser больше не нужно: глифы доступны сразу.
document.addEventListener('DOMContentLoaded', () => {
  StartGame('game-container');
});
