import { describe, it, expect } from 'vitest';
import {
  createStackGame, speedAt, FIELD_WIDTH, START_WIDTH, PERFECT_EPS,
} from './stack';
import { computeScore, MAX_SCORE } from './score';

/** Игра с предсказуемым RNG: rnd()=0 → блок стартует слева и едет вправо. */
const rightward = () => createStackGame({ rng: () => 0 });

describe('createStackGame · старт', () => {
  it('фундамент по центру поля, счёт нулевой', () => {
    const g = rightward();
    expect(g.blocks).toHaveLength(1);
    expect(g.blocks[0]).toEqual({ x: (FIELD_WIDTH - START_WIDTH) / 2, width: START_WIDTH });
    expect(g.score).toBe(0);
    expect(g.placed).toBe(0);
    expect(g.perfects).toBe(0);
    expect(g.isOver).toBe(false);
  });

  it('текущий блок повторяет ширину вершины и стоит у края', () => {
    const g = rightward();
    expect(g.current.width).toBe(START_WIDTH);
    expect(g.current.x).toBe(0);
    expect(g.current.dir).toBe(1);
  });
});

describe('drop() · идеальное попадание', () => {
  it('ширина не уменьшается, счёт +1 и бонус', () => {
    const g = rightward();
    const top = g.blocks[0];
    g.setCurrentX(top.x);
    const r = g.drop();
    expect(r).toEqual({ placed: true, perfect: true, cutWidth: 0, cutX: top.x, over: false });
    expect(g.blocks).toHaveLength(2);
    expect(g.blocks[1].width).toBe(START_WIDTH);
    expect(g.blocks[1].x).toBe(top.x);
    expect(g.placed).toBe(1);
    expect(g.perfects).toBe(1);
    expect(g.score).toBe(2); // блок + бонус
    expect(g.isOver).toBe(false);
  });

  it('промах внутри допуска щёлкает блок ровно на место', () => {
    const g = rightward();
    const top = g.blocks[0];
    g.setCurrentX(top.x + PERFECT_EPS);
    const r = g.drop();
    expect(r.perfect).toBe(true);
    expect(g.blocks[1]).toEqual({ x: top.x, width: START_WIDTH });
  });
});

describe('drop() · частичное перекрытие', () => {
  it('свес справа отрезается, ширина = перекрытию', () => {
    const g = rightward();
    const top = g.blocks[0];
    g.setCurrentX(top.x + 30);
    const r = g.drop();
    expect(r.placed).toBe(true);
    expect(r.perfect).toBe(false);
    expect(r.over).toBe(false);
    expect(r.cutWidth).toBe(30);
    expect(r.cutX).toBe(top.x + START_WIDTH); // кусок справа от новой вершины
    expect(g.blocks[1]).toEqual({ x: top.x + 30, width: START_WIDTH - 30 });
    expect(g.score).toBe(1);
    expect(g.perfects).toBe(0);
  });

  it('свес слева отрезается, левый край башни не сдвигается', () => {
    const g = rightward();
    const top = g.blocks[0];
    g.setCurrentX(top.x - 40);
    const r = g.drop();
    expect(r.cutWidth).toBe(40);
    expect(r.cutX).toBe(top.x - 40);
    expect(g.blocks[1]).toEqual({ x: top.x, width: START_WIDTH - 40 });
    expect(g.score).toBe(1);
  });

  it('следующий блок наследует суженную ширину', () => {
    const g = rightward();
    g.setCurrentX(g.blocks[0].x + 30);
    g.drop();
    expect(g.current.width).toBe(START_WIDTH - 30);
  });
});

describe('drop() · конец игры', () => {
  it('нулевое перекрытие завершает игру и не даёт очков', () => {
    const g = rightward();
    const top = g.blocks[0];
    g.setCurrentX(top.x + START_WIDTH); // ровно встык — перекрытия нет
    const r = g.drop();
    expect(r).toEqual({ placed: false, perfect: false, cutWidth: START_WIDTH, cutX: top.x + START_WIDTH, over: true });
    expect(g.isOver).toBe(true);
    expect(g.blocks).toHaveLength(1);
    expect(g.score).toBe(0);
  });

  it('полный промах мимо башни завершает игру', () => {
    const g = createStackGame({ rng: () => 0.9, startWidth: 60 }); // старт справа
    const top = g.blocks[0];
    g.setCurrentX(top.x + 200);
    expect(g.drop().over).toBe(true);
    expect(g.isOver).toBe(true);
  });

  it('после конца игры drop() и tick() ничего не меняют', () => {
    const g = rightward();
    g.setCurrentX(g.blocks[0].x + START_WIDTH);
    g.drop();
    const x = g.current.x;
    g.tick(500);
    expect(g.current.x).toBe(x);
    const r = g.drop();
    expect(r.over).toBe(true);
    expect(r.placed).toBe(false);
    expect(g.blocks).toHaveLength(1);
  });
});

describe('tick() · движение и отражение', () => {
  it('отражает блок от правого, затем от левого края', () => {
    const g = rightward();
    const max = FIELD_WIDTH - START_WIDTH; // 280
    const speed = speedAt(0);
    expect(g.current.speed).toBeCloseTo(speed, 6);

    g.tick(2000); // 0 → 320 → отражение → 240
    expect(g.current.dir).toBe(-1);
    expect(g.current.x).toBeCloseTo(2 * max - speed * 2000, 6);

    g.tick(2000); // 240 → −80 → отражение → 80
    expect(g.current.dir).toBe(1);
    expect(g.current.x).toBeCloseTo(80, 6);
  });

  it('никогда не выпускает блок за границы поля', () => {
    const g = createStackGame({ seed: 7 });
    for (let i = 0; i < 400; i++) {
      g.tick(37);
      expect(g.current.x).toBeGreaterThanOrEqual(0);
      expect(g.current.x + g.current.width).toBeLessThanOrEqual(FIELD_WIDTH + 1e-9);
    }
  });

  it('переживает огромный dt (лаг/фоновая вкладка)', () => {
    const g = rightward();
    g.tick(100_000);
    expect(g.current.x).toBeGreaterThanOrEqual(0);
    expect(g.current.x).toBeLessThanOrEqual(FIELD_WIDTH - START_WIDTH);
  });
});

describe('скорость', () => {
  it('растёт с числом установленных блоков', () => {
    const g = rightward();
    const start = g.current.speed;
    for (let i = 0; i < 5; i++) {
      g.setCurrentX(g.blocks[g.blocks.length - 1].x);
      g.drop();
    }
    expect(g.placed).toBe(5);
    expect(g.current.speed).toBeGreaterThan(start);
    expect(g.current.speed).toBeCloseTo(speedAt(5), 6);
  });

  it('speedAt имеет потолок', () => {
    expect(speedAt(10_000)).toBe(speedAt(20_000));
  });
});

describe('детерминированность', () => {
  it('один seed → одинаковые партии', () => {
    const play = () => {
      const g = createStackGame({ seed: 2024 });
      for (let i = 0; i < 12 && !g.isOver; i++) {
        g.tick(430 + i * 11);
        g.drop();
      }
      return { blocks: g.blocks.map((b) => ({ ...b })), current: { ...g.current }, score: g.score };
    };
    expect(play()).toEqual(play());
  });

  it('разные seed → разные партии', () => {
    const play = (seed: number) => {
      const g = createStackGame({ seed });
      for (let i = 0; i < 8 && !g.isOver; i++) { g.tick(410); g.drop(); }
      return g.blocks.map((b) => `${b.x.toFixed(3)}:${b.width.toFixed(3)}`).join('|');
    };
    expect(play(1)).not.toEqual(play(99));
  });
});

describe('computeScore', () => {
  it('100 за блок и 50 за идеальное попадание', () => {
    expect(computeScore({ blocks: 12, perfects: 3 })).toBe(1350);
    expect(computeScore({ blocks: 0, perfects: 0 })).toBe(0);
  });
  it('ограничен антифрод-потолком', () => {
    expect(computeScore({ blocks: 10_000, perfects: 10_000 })).toBe(MAX_SCORE);
  });
});
