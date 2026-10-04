import {Scene} from 'phaser';
import type {Locale} from '../../core/locale';
import {BOARD_H,BOARD_W,cellsOf,createBlockDrop,ghostY,hardDrop,rotate,shift,step,type BlockDropState,type ShapeType} from '../../core/blockDrop';
import {COLORS,FONT,BLOCK_COLORS} from '../palette';
import {applyTheme,setupCamera,makeBackButton,makeButton,makeCard,makeChip,playSound,toast,EASE,DUR,sparkle,C} from '../ui';
import {DPR} from '../dpr';
import {t} from '../../i18n';
import type {Session} from '../../bridge/session';
import type {AppToGameEvent} from '@gamewingo/game-bridge';
import {createRoundTimer,type RoundTimer} from '../roundTimer';

const W=400,CELL=25,BOARD_X=75,BOARD_Y=116;
const TYPES:readonly ShapeType[]=['I','O','T','L','J','S','Z'];

export class Game extends Scene{
  private locale:Locale='ru';private session?:Session;private state!:BlockDropState;private next!:ShapeType;
  private fixed:Phaser.GameObjects.Rectangle[]=[];private active:Phaser.GameObjects.Rectangle[]=[];private ghost:Phaser.GameObjects.Rectangle[]=[];
  private scoreChip?:ReturnType<typeof makeChip>;private linesChip?:ReturnType<typeof makeChip>;private speedChip?:ReturnType<typeof makeChip>;
  private fallEvent?:Phaser.Time.TimerEvent;private timer?:RoundTimer;private busy=false;private finished=false;private howto=false;
  constructor(){super('Game');}
  create(){
    this.fixed=[];this.active=[];this.ghost=[];this.busy=false;this.finished=false;applyTheme(this);setupCamera(this);this.cameras.main.fadeIn(200,...COLORS.fade);
    this.locale=(this.registry.get('locale') as Locale)??'ru';this.session=this.registry.get('session') as Session|undefined;this.howto=Boolean(this.registry.get('howto'));this.registry.set('howto',false);
    this.state=createBlockDrop(this.randomType());this.next=this.randomType();this.buildHud();this.buildBoard();this.buildControls();this.paint(false);
    if(this.howto)this.buildTutorial();else{this.timer=createRoundTimer(()=>performance.now());this.timer.start();this.session?.start();}
    this.startFall();this.bindKeyboard();
    const off=this.session?.onApp((event:AppToGameEvent)=>{if(event.type==='PAUSE'){this.timer?.pause();if(this.fallEvent)this.fallEvent.paused=true;}else if(event.type==='RESUME'){this.timer?.resume();if(this.fallEvent)this.fallEvent.paused=false;}});if(off)this.events.once('shutdown',off);
  }
  private randomType():ShapeType{return TYPES[Math.floor(Math.random()*TYPES.length)];}
  private buildHud(){makeBackButton(this,62,34,t(this.locale,'menu.back'),()=>this.goBack());this.scoreChip=makeChip(this,185,34,t(this.locale,'game.score',{n:0}),92);this.linesChip=makeChip(this,282,34,t(this.locale,'game.lines',{n:0}),88);this.speedChip=makeChip(this,360,34,t(this.locale,'game.level',{n:1}),72);this.add.text(W/2,78,t(this.locale,'game.hint'),{fontFamily:FONT,fontSize:13,color:COLORS.headMuted}).setOrigin(.5).setResolution(DPR);}
  private buildBoard(){makeCard(this,60,100,280,432);const grid=this.add.graphics().setDepth(0);for(let y=0;y<BOARD_H;y++)for(let x=0;x<BOARD_W;x++){grid.fillStyle(C.slot,1).fillRoundedRect(BOARD_X+x*CELL,BOARD_Y+y*CELL,CELL-2,CELL-2,4);}}
  private buildControls(){makeButton(this,66,572,t(this.locale,'game.left'),()=>this.command('left'),{width:96});makeButton(this,200,572,t(this.locale,'game.rotate'),()=>this.command('rotate'),{width:152});makeButton(this,334,572,t(this.locale,'game.right'),()=>this.command('right'),{width:96});makeButton(this,200,628,t(this.locale,'game.drop'),()=>this.command('drop'),{width:336,primary:true});}
  private buildTutorial(){makeCard(this,28,660,344,52).setDepth(30);this.add.text(W/2,686,`${t(this.locale,'onboarding.take')}\n${t(this.locale,'onboarding.goal')}`,{fontFamily:FONT,fontSize:12,color:COLORS.headText,align:'center',wordWrap:{width:320}}).setOrigin(.5).setResolution(DPR).setDepth(31);}
  private startFall(){this.fallEvent?.remove();this.fallEvent=this.time.addEvent({delay:this.dropDelay(),loop:true,callback:()=>this.autoStep()});}
  private dropDelay():number{return Math.max(230,780-Math.floor(this.state.lines/8)*70);}
  private autoStep(){if(this.busy||this.finished)return;const result=step(this.state,this.next);this.applyResult(result.state,result.locked,result.clearedLines,true);}
  private bindKeyboard(){this.input.keyboard?.on('keydown-LEFT',()=>this.command('left'));this.input.keyboard?.on('keydown-RIGHT',()=>this.command('right'));this.input.keyboard?.on('keydown-UP',()=>this.command('rotate'));this.input.keyboard?.on('keydown-SPACE',()=>this.command('drop'));}
  private command(action:'left'|'right'|'rotate'|'drop'){
    if(this.busy||this.finished)return;
    if(action==='left'){const next=shift(this.state,-1);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    if(action==='right'){const next=shift(this.state,1);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    if(action==='rotate'){const next=rotate(this.state);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    const result=hardDrop(this.state,this.next);this.busy=true;const targetY=ghostY(this.state);this.active.forEach((block,index)=>{const cell=cellsOf({...this.state.active,y:targetY})[index];this.tweens.add({targets:block,y:BOARD_Y+cell.y*CELL+CELL/2,duration:Math.min(DUR.move,120+result.dropDistance*18),ease:EASE.in});});this.time.delayedCall(Math.min(DUR.move,120+result.dropDistance*18),()=>{this.busy=false;this.applyResult(result.state,true,result.clearedLines,false);});
  }
  private applyResult(state:BlockDropState,locked:boolean,cleared:number,animate:boolean){
    this.state=state;if(locked){this.next=this.randomType();playSound(cleared?'star':'ok');if(cleared){sparkle(this,W/2,BOARD_Y+(BOARD_H-1)*CELL,{colors:[COLORS.primary,COLORS.accent,COLORS.gold],count:22});toast(this,W/2,520,t(this.locale,'game.cleared'));}this.startFall();}
    this.paint(animate&&!locked);if(state.over){this.finished=true;this.fallEvent?.remove();this.time.delayedCall(450,()=>this.endGame());}
  }
  private paint(animate:boolean){
    this.fixed.forEach((v)=>v.destroy());this.fixed=[];
    for(let y=0;y<BOARD_H;y++)for(let x=0;x<BOARD_W;x++){const type=this.state.board[y][x];if(type){const block=this.makeBlock(x,y,BLOCK_COLORS[type],1,2);this.fixed.push(block);}}
    this.active.forEach((v)=>v.destroy());this.ghost.forEach((v)=>v.destroy());this.active=[];this.ghost=[];
    const gy=ghostY(this.state);for(const point of cellsOf({...this.state.active,y:gy})){this.ghost.push(this.makeBlock(point.x,point.y,BLOCK_COLORS[this.state.active.type],.18,1));}
    for(const point of cellsOf(this.state.active)){const block=this.makeBlock(point.x,point.y,BLOCK_COLORS[this.state.active.type],1,4);if(animate){block.y-=CELL;this.tweens.add({targets:block,y:block.y+CELL,duration:DUR.tap,ease:EASE.settle});}this.active.push(block);}
    this.scoreChip?.setText(t(this.locale,'game.score',{n:this.state.score}));this.linesChip?.setText(t(this.locale,'game.lines',{n:this.state.lines}));this.speedChip?.setText(t(this.locale,'game.level',{n:Math.floor(this.state.lines/8)+1}));
  }
  private makeBlock(x:number,y:number,color:number,alpha:number,depth:number){return this.add.rectangle(BOARD_X+x*CELL+CELL/2,BOARD_Y+y*CELL+CELL/2,CELL-3,CELL-3,color,alpha).setStrokeStyle(1,C.white,.55).setDepth(depth);}
  private goBack(){if(this.finished)return;this.finished=true;this.fallEvent?.remove();this.cameras.main.fadeOut(180,...COLORS.fade);this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('MainMenu'));}
  private endGame(){if(this.howto){this.scene.start('MainMenu');return;}const durationMs=Math.round(this.timer?.elapsedMs()??0);void this.session?.finish({score:this.state.score,lines:this.state.lines,pieces:this.state.pieces,durationMs});this.registry.set('lastGame',{locale:this.locale,score:this.state.score,lines:this.state.lines,pieces:this.state.pieces,durationMs});this.cameras.main.fadeOut(220,...COLORS.fade);this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('GameOver'));}
}
