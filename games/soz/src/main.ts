import StartGame from './game/main';

// Дожидаемся загрузки бандл-шрифта до старта Phaser — иначе canvas-текст
// отрисуется системным фолбэком. Не блокируем дольше 1.5с (сеть/офлайн).
async function boot() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('400 16px Rubik'),
        document.fonts.load('400 16px Rubik', 'ў'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    /* шрифт не загрузился — идём на системном фолбэке */
  }
  StartGame('game-container');
}

document.addEventListener('DOMContentLoaded', boot);
