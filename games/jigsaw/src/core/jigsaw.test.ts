import { describe, expect, it } from 'vitest';
import { createJigsawGame, nearestSlot, slotCenter } from './jigsaw';
import { mulberry32 } from './rng';
import { PICTURES, PICTURE_COUNT, pictureById } from './pictures';
import { LADDER, LADDER_SIZE, levelAt } from './levels';
import { computeScore, MAX_SCORE } from './score';
import { PAINTERS } from '../game/painters';

const rng = () => mulberry32(7);

describe('картинки и истории', () => {
  it('пятнадцать картинок, id уникальны', () => {
    expect(PICTURE_COUNT).toBe(15);
    const ids = PICTURES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('у каждой картинки есть название и история на двух языках', () => {
    for (const p of PICTURES) {
      for (const text of [p.title, p.story]) {
        expect(text.ru.trim().length, p.id).toBeGreaterThan(0);
        expect(text.uz.trim().length, p.id).toBeGreaterThan(0);
      }
      // История — именно история, а не подпись: минимум две фразы.
      expect(p.story.ru.length, p.id).toBeGreaterThan(60);
      expect(p.story.uz.length, p.id).toBeGreaterThan(60);
    }
  });

  it('для каждой картинки есть векторная сцена-плейсхолдер', () => {
    for (const p of PICTURES) expect(PAINTERS[p.id], p.id).toBeTypeOf('function');
  });

  it('неизвестный id не роняет игру', () => {
    expect(pictureById('нет-такой').id).toBe(PICTURES[0].id);
  });
});

describe('createJigsawGame', () => {
  it('кусочков столько же, сколько клеток поля', () => {
    const game = createJigsawGame({ cols: 3, rows: 4 }, rng());
    expect(game.total).toBe(12);
    expect(game.pending).toHaveLength(12);
    expect(new Set(game.pending).size).toBe(12);
  });

  it('кусочек на своём месте — засчитан, промах — только счётчик', () => {
    const game = createJigsawGame({ cols: 2, rows: 2 }, rng());
    expect(game.drop(0, 1)).toBe('wrong');
    expect(game.wrongDrops).toBe(1);
    expect(game.placed).toBe(0);

    expect(game.drop(0, 0)).toBe('placed');
    expect(game.placed).toBe(1);
    expect(game.isPlaced(0)).toBe(true);
    expect(game.pending).not.toContain(0);
  });

  it('в занятый слот повторно не положить', () => {
    const game = createJigsawGame({ cols: 2, rows: 2 }, rng());
    game.drop(1, 1);
    expect(game.drop(1, 1)).toBe('busy');
    expect(game.wrongDrops).toBe(0);
  });

  it('партия завершается, когда все кусочки на местах', () => {
    const game = createJigsawGame({ cols: 2, rows: 2 }, rng());
    for (let i = 0; i < 4; i++) {
      expect(game.isComplete).toBe(false);
      game.drop(i, i);
    }
    expect(game.isComplete).toBe(true);
    expect(game.pending).toHaveLength(0);
  });

  it('поле меньше 2×2 не бывает — защита от битого сохранения', () => {
    const game = createJigsawGame({ cols: 0, rows: 1 }, rng());
    expect(game.cols).toBe(2);
    expect(game.rows).toBe(2);
  });
});

describe('геометрия поля', () => {
  it('slotCenter считает центр клетки', () => {
    expect(slotCenter(0, 3, 100, 100)).toEqual({ x: 50, y: 50 });
    expect(slotCenter(4, 3, 100, 100)).toEqual({ x: 150, y: 150 });
  });

  it('nearestSlot ловит бросок в клетку и игнорирует дальний промах', () => {
    expect(nearestSlot(55, 55, 3, 3, 100, 100, 60)).toBe(0);
    // Угол клетки дальше maxDist от центра — не считается броском в слот.
    expect(nearestSlot(5, 5, 3, 3, 100, 100, 30)).toBeNull();
    // За пределами поля слота нет.
    expect(nearestSlot(-10, 50, 3, 3, 100, 100, 60)).toBeNull();
    expect(nearestSlot(50, 999, 3, 3, 100, 100, 60)).toBeNull();
  });
});

describe('лестница и очки', () => {
  it('пятнадцать уровней, у каждого своя картинка', () => {
    expect(LADDER_SIZE).toBe(15);
    const pics = LADDER.map((lv) => lv.params.picture);
    expect(new Set(pics).size).toBe(15);
  });

  it('число кусочков не убывает по лестнице', () => {
    for (let i = 1; i < LADDER.length; i++) {
      const prev = LADDER[i - 1].params;
      const cur = LADDER[i].params;
      expect(cur.cols * cur.rows).toBeGreaterThanOrEqual(prev.cols * prev.rows);
    }
  });

  it('подсказка-контур пропадает только во второй половине лестницы', () => {
    expect(LADDER[0].params.ghost).toBe(true);
    expect(LADDER[LADDER_SIZE - 1].params.ghost).toBe(false);
  });

  it('картинки уровней есть в манифесте', () => {
    const ids = new Set(PICTURES.map((p) => p.id));
    for (const lv of LADDER) expect(ids.has(lv.params.picture), `уровень ${lv.n}`).toBe(true);
  });

  it('аккуратная сборка даёт больше очков, чем небрежная', () => {
    expect(computeScore({ pieces: 12, wrongDrops: 0 }))
      .toBeGreaterThan(computeScore({ pieces: 12, wrongDrops: 9 }));
  });

  it('MAX_SCORE не меньше любого достижимого результата', () => {
    for (const lv of LADDER) {
      const pieces = lv.params.cols * lv.params.rows;
      expect(computeScore({ pieces, wrongDrops: 0 })).toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('levelAt зажимает номер в границы лестницы', () => {
    expect(levelAt(-5).n).toBe(1);
    expect(levelAt(99).n).toBe(LADDER_SIZE);
  });
});
