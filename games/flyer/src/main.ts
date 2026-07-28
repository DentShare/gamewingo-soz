import StartGame from './game/main';

// Полная готовность бандл-шрифта ДО старта Phaser — иначе первый canvas-рендер
// текста запекает «тофу» (белые блоки) на кнопках и заголовках.
async function ensureFont(): Promise<void> {
  const family = 'Rubik';
  const sizes = ['16px', '26px', '42px'];
  const samples = ['Полёт', 'Parvoz', 'абвгд'];
  try {
    await Promise.all(
      sizes.flatMap((sz) => samples.map((s) => document.fonts.load(`400 ${sz} ${family}`, s))),
    );
    await document.fonts.ready;
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      for (const sz of sizes) {
        ctx.font = `${sz} ${family}`;
        ctx.fillText('Полёт Parvoz', 0, 40);
      }
    }
  } catch {
    /* офлайн/ошибка загрузки — играем на системном фолбэке */
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await ensureFont();
  StartGame('game-container');
});
