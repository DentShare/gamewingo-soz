export const MAX_SCORE=999_999;
export function safeScore(score:number):number{return Math.max(0,Math.min(MAX_SCORE,Math.round(score)));}
