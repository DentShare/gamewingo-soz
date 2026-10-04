import {describe,expect,it} from 'vitest';
import {MAX_SCORE,safeScore} from './score';
describe('score',()=>{it('clamps submitted score',()=>{expect(safeScore(-2)).toBe(0);expect(safeScore(MAX_SCORE+1)).toBe(MAX_SCORE);});});
