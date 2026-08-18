import StartGame from './game/main';
import { installAudioUnlock } from './game/ui';

// Шрифт каталога — системный (docs/DESIGN.md), поэтому ждать загрузки веб-шрифта
// перед стартом Phaser не нужно: глифы доступны сразу.
document.addEventListener('DOMContentLoaded', () => {
  // iOS WKWebView включает звук только внутри жеста пользователя — вешаем заранее.
  installAudioUnlock();
  StartGame('game-container');
});
