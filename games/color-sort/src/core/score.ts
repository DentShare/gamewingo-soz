export interface ScoreInput { level:number; moves:number; par:number; }
export const MAX_SCORE=12_000;
export function computeScore({level,moves,par}:ScoreInput):number { const base=1000+Math.max(0,Math.min(level,10))*100; const efficiency=Math.max(0,600-Math.max(0,moves-par)*50); return Math.min(MAX_SCORE,base+efficiency); }
