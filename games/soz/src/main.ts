import StartGame from './game/main';

// Полная готовность бандл-шрифта ДО старта Phaser. Иначе первый canvas-рендер текста
// (особенно пустые плитки, которые заполняются позже) запекает «тофу» — белые блоки.
async function ensureFont(): Promise<void> {
  const family = 'Rubik';
  const sizes = ['16px', '26px', '34px', '46px'];
  const samples = ['Йцукен', "oʻgʻshchng", 'абвгд'];
  try {
    await Promise.all(
      sizes.flatMap((sz) => samples.map((s) => document.fonts.load(`400 ${sz} ${family}`, s))),
    );
    await document.fonts.ready;
    // Прогрев растеризации: форсируем реальную отрисовку глифов в 2D-контексте.
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      for (const sz of sizes) {
        ctx.font = `${sz} ${family}`;
        ctx.fillText("Йцукен oʻshchа", 0, 40);
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
