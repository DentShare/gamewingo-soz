import { describe,expect,it } from 'vitest';
import { BOARD_H,BOARD_W,cellsOf,createBlockDrop,fits,hardDrop,rotate,shift,step,type BlockDropState } from './blockDrop';

describe('block drop core',()=>{
  it('spawns a piece on an empty 10×16 board',()=>{const state=createBlockDrop('T');expect(state.board).toHaveLength(BOARD_H);expect(state.board[0]).toHaveLength(BOARD_W);expect(cellsOf(state.active)).toHaveLength(4);});
  it('does not move through a wall',()=>{let state=createBlockDrop('O');for(let i=0;i<8;i++)state=shift(state,-1);expect(state.active.x).toBe(-1);expect(shift(state,-1)).toBe(state);});
  it('rotates with wall kicks and remains valid',()=>{let state=createBlockDrop('I');for(let i=0;i<5;i++)state=shift(state,-1);state=rotate(state);expect(fits(state.board,state.active)).toBe(true);});
  it('locks after a hard drop and awards distance points',()=>{const result=hardDrop(createBlockDrop('T'),'O');expect(result.locked).toBe(true);expect(result.state.pieces).toBe(1);expect(result.state.score).toBeGreaterThan(0);expect(result.dropDistance).toBeGreaterThan(0);});
  it('clears a complete row',()=>{const base=createBlockDrop('I');const board=base.board.map((row)=>[...row]);for(let x=0;x<BOARD_W;x++)board[BOARD_H-1][x]=x<6?'T':null;const state:BlockDropState={...base,board,active:{type:'I',rotation:0,x:6,y:BOARD_H-2}};const result=step(state,'O');expect(result.clearedLines).toBe(1);expect(result.state.lines).toBe(1);expect(result.state.score).toBe(100);});
});
