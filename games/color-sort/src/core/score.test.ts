import { describe,expect,it } from 'vitest'; import { computeScore,MAX_SCORE } from './score';
describe('color sort score',()=>{it('rewards efficient solutions',()=>{expect(computeScore({level:1,moves:4,par:4})).toBe(1700);expect(computeScore({level:1,moves:8,par:4})).toBe(1500);});it('never exceeds ceiling',()=>expect(computeScore({level:999,moves:0,par:100})).toBeLessThanOrEqual(MAX_SCORE));});
