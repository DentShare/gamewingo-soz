export const BOARD_W = 10;
export const BOARD_H = 16;

export type ShapeType = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z';
export type BoardCell = ShapeType | null;
export interface Point { readonly x:number; readonly y:number; }
export interface Piece { readonly type:ShapeType; readonly rotation:number; readonly x:number; readonly y:number; }
export interface BlockDropState {
  readonly board:readonly (readonly BoardCell[])[];
  readonly active:Piece;
  readonly score:number;
  readonly lines:number;
  readonly pieces:number;
  readonly over:boolean;
}
export interface StepResult { readonly state:BlockDropState; readonly locked:boolean; readonly clearedLines:number; readonly dropDistance:number; }

const SHAPES:Record<ShapeType,readonly (readonly Point[])[]> = {
  I: [
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}],
    [{x:2,y:0},{x:2,y:1},{x:2,y:2},{x:2,y:3}],
  ],
  O: [[{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:2,y:1}]],
  T: [
    [{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
    [{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
    [{x:1,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:2}],
  ],
  L: [
    [{x:2,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
    [{x:1,y:0},{x:1,y:1},{x:1,y:2},{x:2,y:2}],
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:0,y:2}],
    [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:1,y:2}],
  ],
  J: [
    [{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1}],
    [{x:1,y:0},{x:2,y:0},{x:1,y:1},{x:1,y:2}],
    [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:2,y:2}],
    [{x:1,y:0},{x:1,y:1},{x:0,y:2},{x:1,y:2}],
  ],
  S: [
    [{x:1,y:0},{x:2,y:0},{x:0,y:1},{x:1,y:1}],
    [{x:1,y:0},{x:1,y:1},{x:2,y:1},{x:2,y:2}],
  ],
  Z: [
    [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:2,y:1}],
    [{x:2,y:0},{x:1,y:1},{x:2,y:1},{x:1,y:2}],
  ],
};

const emptyBoard = ():BoardCell[][] => Array.from({length:BOARD_H},()=>Array<BoardCell>(BOARD_W).fill(null));
const spawn = (type:ShapeType):Piece => ({type,rotation:0,x:3,y:0});
export const cellsOf = (piece:Piece):Point[] => SHAPES[piece.type][piece.rotation%SHAPES[piece.type].length]
  .map((point)=>({x:piece.x+point.x,y:piece.y+point.y}));

export function fits(board:readonly (readonly BoardCell[])[], piece:Piece):boolean {
  return cellsOf(piece).every(({x,y})=>x>=0&&x<BOARD_W&&y>=0&&y<BOARD_H&&!board[y][x]);
}

export function createBlockDrop(first:ShapeType='T'):BlockDropState {
  return {board:emptyBoard(),active:spawn(first),score:0,lines:0,pieces:0,over:false};
}

function withPiece(state:BlockDropState,piece:Piece):BlockDropState {
  return fits(state.board,piece)?{...state,active:piece}:state;
}

export function shift(state:BlockDropState,dx:-1|1):BlockDropState {
  if(state.over)return state;
  return withPiece(state,{...state.active,x:state.active.x+dx});
}

export function rotate(state:BlockDropState):BlockDropState {
  if(state.over)return state;
  const rotations=SHAPES[state.active.type].length;
  const rotated={...state.active,rotation:(state.active.rotation+1)%rotations};
  if(fits(state.board,rotated))return {...state,active:rotated};
  for(const kick of [-1,1,-2,2] as const){const candidate={...rotated,x:rotated.x+kick};if(fits(state.board,candidate))return {...state,active:candidate};}
  return state;
}

function lock(state:BlockDropState,next:ShapeType,dropBonus=0):StepResult {
  const board=state.board.map((row)=>[...row]);
  for(const {x,y} of cellsOf(state.active))board[y][x]=state.active.type;
  const kept=board.filter((row)=>row.some((cell)=>cell===null));
  const cleared=BOARD_H-kept.length;
  while(kept.length<BOARD_H)kept.unshift(Array<BoardCell>(BOARD_W).fill(null));
  const totalLines=state.lines+cleared;
  const level=Math.floor(state.lines/10)+1;
  const linePoints=[0,100,300,500,800][cleared]??1200;
  const active=spawn(next);
  const over=!fits(kept,active);
  return {state:{board:kept,active,score:state.score+dropBonus+linePoints*level,lines:totalLines,pieces:state.pieces+1,over},locked:true,clearedLines:cleared,dropDistance:0};
}

export function step(state:BlockDropState,next:ShapeType):StepResult {
  if(state.over)return {state,locked:false,clearedLines:0,dropDistance:0};
  const moved={...state.active,y:state.active.y+1};
  if(fits(state.board,moved))return {state:{...state,active:moved},locked:false,clearedLines:0,dropDistance:1};
  return lock(state,next);
}

export function hardDrop(state:BlockDropState,next:ShapeType):StepResult {
  if(state.over)return {state,locked:false,clearedLines:0,dropDistance:0};
  let piece=state.active,distance=0;
  while(fits(state.board,{...piece,y:piece.y+1})){piece={...piece,y:piece.y+1};distance++;}
  const result=lock({...state,active:piece},next,distance*2);
  return {...result,dropDistance:distance};
}

export function ghostY(state:BlockDropState):number {
  let y=state.active.y;
  while(fits(state.board,{...state.active,y:y+1}))y++;
  return y;
}
