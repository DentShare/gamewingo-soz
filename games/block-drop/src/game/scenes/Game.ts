import {Scene} from 'phaser';
import type {Locale} from '../../core/locale';
import {BOARD_H,BOARD_W,cellsOf,createBlockDrop,ghostY,hardDrop,rotate,shift,step,type BlockDropState,type ShapeType} from '../../core/blockDrop';
import {COLORS,FONT,BLOCK_COLORS} from '../palette';
import {applyTheme,setupCamera,makeBackButton,makeButton,makeCard,makeChip,openPauseSheet,guardBrowserBack,playSound,toast,EASE,DUR,sparkle,C} from '../ui';
import {DPR,VIEW_BOTTOM} from '../dpr';
import {HeldControls,type RepeatAction} from '../../core/controls';
import {SwipeControls} from '../../core/gestures';
import {t} from '../../i18n';
import type {Session} from '../../bridge/session';
import type {AppToGameEvent} from '@gamewingo/game-bridge';
import {createRoundTimer,type RoundTimer} from '../roundTimer';

const W=400,BOARD_Y=116;
type Action=RepeatAction|'rotate'|'rotateBack'|'drop';
const TYPES:readonly ShapeType[]=['I','O','T','L','J','S','Z'];

export class Game extends Scene{
  private locale:Locale='ru';private session?:Session;private state!:BlockDropState;private next!:ShapeType;
  private fixed:Phaser.GameObjects.Rectangle[]=[];private active:Phaser.GameObjects.Rectangle[]=[];private ghost:Phaser.GameObjects.Rectangle[]=[];
  private scoreChip?:ReturnType<typeof makeChip>;private linesChip?:ReturnType<typeof makeChip>;private speedChip?:ReturnType<typeof makeChip>;
  private fallEvent?:Phaser.Time.TimerEvent;private timer?:RoundTimer;private busy=false;private finished=false;private howto=false;
  private pauseReasons=new Set<'host'|'hidden'|'sheet'>();
  private held=new HeldControls();
  private mobile=false;private cellSize=25;private boardX=75;
  private gestures=new SwipeControls(25);
  private worldTweens:Phaser.Tweens.Tween[]=[];
  private pauseSheet?:ReturnType<typeof openPauseSheet>;
  constructor(){super('Game');}
  create(){
    this.mobile=window.matchMedia('(any-pointer: coarse)').matches;
    this.cellSize=this.mobile?32:25;this.boardX=(W-BOARD_W*this.cellSize)/2;this.gestures=new SwipeControls(this.cellSize);
    this.held.clear();this.fixed=[];this.active=[];this.ghost=[];this.busy=false;this.finished=false;this.timer=undefined;this.pauseReasons.clear();this.worldTweens=[];this.pauseSheet=undefined;this.time.paused=false;applyTheme(this);setupCamera(this);this.cameras.main.fadeIn(200,...COLORS.fade);
    this.locale=(this.registry.get('locale') as Locale)??'ru';this.session=this.registry.get('session') as Session|undefined;this.howto=Boolean(this.registry.get('howto'));this.registry.set('howto',false);
    this.state=createBlockDrop(this.randomType());this.next=this.randomType();this.buildHud();this.buildBoard();this.buildControls();this.paint(false);
    if(this.howto)this.buildTutorial();else{this.timer=createRoundTimer(()=>performance.now());this.timer.start();this.session?.start();}
    this.startFall();this.bindKeyboard();if(this.mobile)this.bindGestures();
    const off=this.session?.onApp((event:AppToGameEvent)=>{if(event.type==='PAUSE'){this.setPaused('host',true);this.openPause();}else if(event.type==='RESUME')this.setPaused('host',false);});
    const onVisibility=()=>{this.setPaused('hidden',document.hidden);if(document.hidden)this.openPause();};
    document.addEventListener('visibilitychange',onVisibility);if(document.hidden)onVisibility();
    const offBack=guardBrowserBack(()=>{if(this.pauseSheet?.open)this.exitToMenu();else this.openPause();});
    this.events.once('shutdown',()=>{off?.();offBack();document.removeEventListener('visibilitychange',onVisibility);this.time.paused=false;this.pauseSheet?.close();});
  }
  update(time:number){if(!this.busy&&!this.finished&&!this.pauseReasons.size)this.held.update(time,action=>this.command(action));}
  private randomType():ShapeType{return TYPES[Math.floor(Math.random()*TYPES.length)];}
  private buildHud(){makeBackButton(this,62,34,t(this.locale,'menu.back'),()=>this.goBack());this.scoreChip=makeChip(this,160,34,t(this.locale,'game.score',{n:0}),92);this.linesChip=makeChip(this,254,34,t(this.locale,'game.lines',{n:0}),88);this.speedChip=makeChip(this,348,34,t(this.locale,'game.level',{n:1}),88);this.add.text(W/2,78,t(this.locale,'game.hint'),{fontFamily:FONT,fontSize:13,color:COLORS.headMuted}).setOrigin(.5).setResolution(DPR);}
  private buildBoard(){makeCard(this,this.boardX-16,100,BOARD_W*this.cellSize+32,BOARD_H*this.cellSize+32);const grid=this.add.graphics().setDepth(0);for(let y=0;y<BOARD_H;y++)for(let x=0;x<BOARD_W;x++){grid.fillStyle(C.slot,1).fillRoundedRect(this.boardX+x*this.cellSize,BOARD_Y+y*this.cellSize,this.cellSize-2,this.cellSize-2,4);}}
  private buildControls(){
    if(this.mobile){
      this.add.text(W/2,674,t(this.locale,'game.gestures'),{fontFamily:FONT,fontSize:14,color:COLORS.headMuted,align:'center',lineSpacing:5,wordWrap:{width:360}}).setOrigin(.5).setResolution(DPR);
      return;
    }
    this.add.text(W/2,536,t(this.locale,'game.keys'),{fontFamily:FONT,fontSize:11,color:COLORS.headMuted,align:'center'}).setOrigin(.5).setResolution(DPR);
    const button=(x:number,y:number,label:string,action:Action,width:number,primary=false)=>{
      const control=makeButton(this,x,y,label,()=>{},{width,height:48,primary});
      const hit=control.root.list[control.root.list.length-1];
      hit.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{
        if(this.pauseReasons.size||this.finished||this.busy)return;
        if(action==='left'||action==='right'||action==='down'){
          this.held.press('pointer:'+pointer.id,action,this.time.now,held=>this.command(held));
        }else this.command(action);
      });
      const release=(pointer:Phaser.Input.Pointer)=>this.held.release('pointer:'+pointer.id);
      hit.on('pointerup',release);hit.on('pointerout',release);
    };
    button(76,570,t(this.locale,'game.left'),'left',88);
    button(200,570,t(this.locale,'game.down'),'down',144);
    button(324,570,t(this.locale,'game.right'),'right',88);
    button(112,626,t(this.locale,'game.rotateBack'),'rotateBack',160);
    button(288,626,t(this.locale,'game.rotate'),'rotate',160);
    button(200,682,t(this.locale,'game.drop'),'drop',336,true);
  }
  private buildTutorial(){makeCard(this,28,54,344,42).setDepth(30);this.add.text(W/2,75,t(this.locale,this.mobile?'onboarding.gestures':'onboarding.take'),{fontFamily:FONT,fontSize:12,color:COLORS.headText,align:'center',wordWrap:{width:320}}).setOrigin(.5).setResolution(DPR).setDepth(31);}
  private bindGestures(){
    const point=(pointer:Phaser.Input.Pointer)=>this.cameras.main.getWorldPoint(pointer.x,pointer.y);
    const available=()=>!this.finished&&!this.busy&&!this.pauseReasons.size;
    const onDown=(pointer:Phaser.Input.Pointer)=>{
      const p=point(pointer);
      if(available()&&p.x>=16&&p.x<=W-16&&p.y>=100&&p.y<=VIEW_BOTTOM-12)this.gestures.start(pointer.id,p.x,p.y,performance.now());
    };
    const onMove=(pointer:Phaser.Input.Pointer)=>{
      if(!available())return;
      const p=point(pointer);this.gestures.move(pointer.id,p.x,p.y).forEach(action=>this.command(action));
    };
    const onUp=(pointer:Phaser.Input.Pointer)=>{
      if(!available())return;
      const p=point(pointer);this.gestures.end(pointer.id,p.x,p.y,performance.now()).forEach(action=>this.command(action));
    };
    const cancel=()=>this.gestures.cancel();
    this.input.on('pointerdown',onDown);this.input.on('pointermove',onMove);this.input.on('pointerup',onUp);
    this.input.on('pointerupoutside',cancel);this.input.on('gameout',cancel);
    window.addEventListener('blur',cancel);window.addEventListener('touchcancel',cancel,true);window.addEventListener('pointercancel',cancel,true);
    this.events.once('shutdown',()=>{
      cancel();this.input.off('pointerdown',onDown);this.input.off('pointermove',onMove);this.input.off('pointerup',onUp);
      this.input.off('pointerupoutside',cancel);this.input.off('gameout',cancel);
      window.removeEventListener('blur',cancel);window.removeEventListener('touchcancel',cancel,true);window.removeEventListener('pointercancel',cancel,true);
    });
  }
  private startFall(){this.fallEvent?.remove();this.fallEvent=this.time.addEvent({delay:this.dropDelay(),loop:true,callback:()=>this.autoStep()});}
  private dropDelay():number{return Math.max(230,780-Math.floor(this.state.lines/8)*70);}
  private autoStep(){if(this.busy||this.finished||this.pauseReasons.size)return;const result=step(this.state,this.next);this.applyResult(result.state,result.locked,result.clearedLines,true);}
  private bindKeyboard(){
    const keyboard=this.input.keyboard;
    const actions:Record<string,Action>={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowDown:'down',KeyS:'down',ArrowUp:'rotate',KeyW:'rotate',KeyX:'rotate',KeyZ:'rotateBack',KeyQ:'rotateBack',Space:'drop'};
    const captures='LEFT,RIGHT,UP,DOWN,A,D,S,W,X,Z,Q,SPACE,P,ESC';
    keyboard?.addCapture(captures);
    // Phaser can deliver the same queued DOM event again within a frame.
    const handled=new WeakSet<KeyboardEvent>();
    const onDown=(event:KeyboardEvent)=>{
      if(handled.has(event))return;handled.add(event);
      if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
      // Escape is already handled by guardBrowserBack (pause → menu).
      if(event.code==='KeyP'){
        if(this.pauseSheet?.open){this.pauseSheet.close();this.pauseSheet=undefined;this.setPaused('sheet',false);}
        else this.openPause();
        return;
      }
      if(this.busy||this.finished||this.pauseReasons.size)return;
      const action=actions[event.code];
      if(action==='left'||action==='right'||action==='down')this.held.press(event.code,action,this.time.now,held=>this.command(held));
      else if(action)this.command(action);
    };
    const onUp=(event:KeyboardEvent)=>{if(handled.has(event))return;handled.add(event);this.held.release(event.code);};
    const clear=()=>this.held.clear();
    keyboard?.on('keydown',onDown);keyboard?.on('keyup',onUp);
    this.input.on('pointerupoutside',clear);
    window.addEventListener('blur',clear);window.addEventListener('pointercancel',clear);
    this.events.once('shutdown',()=>{
      clear();keyboard?.off('keydown',onDown);keyboard?.off('keyup',onUp);keyboard?.removeCapture(captures);
      this.input.off('pointerupoutside',clear);window.removeEventListener('blur',clear);window.removeEventListener('pointercancel',clear);
    });
  }
  private command(action:Action){
    if(this.busy||this.finished||this.pauseReasons.size)return;
    if(action==='left'){const next=shift(this.state,-1);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    if(action==='right'){const next=shift(this.state,1);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    if(action==='down'){const result=step(this.state,this.next);this.applyResult(result.state,result.locked,result.clearedLines,false);return;}
    if(action==='rotate'||action==='rotateBack'){const next=rotate(this.state,action==='rotateBack'?-1:1);if(next!==this.state){this.state=next;this.paint(false);playSound('tap');}return;}
    const result=hardDrop(this.state,this.next);this.applyResult(result.state,true,result.clearedLines,false);
  }
  private applyResult(state:BlockDropState,locked:boolean,cleared:number,animate:boolean){
    this.state=state;if(locked){this.gestures.cancel();this.next=this.randomType();playSound(cleared?'star':'ok');if(cleared){sparkle(this,W/2,BOARD_Y+(BOARD_H-1)*this.cellSize,{colors:[COLORS.primary,COLORS.accent,COLORS.gold],count:22});toast(this,W/2,BOARD_Y+BOARD_H*this.cellSize+4,t(this.locale,'game.cleared'));}this.startFall();}
    this.paint(animate&&!locked);if(state.over){this.finished=true;this.timer?.pause();this.fallEvent?.remove();this.time.delayedCall(450,()=>this.endGame());}
  }
  private paint(animate:boolean){
    this.fixed.forEach((v)=>v.destroy());this.fixed=[];
    for(let y=0;y<BOARD_H;y++)for(let x=0;x<BOARD_W;x++){const type=this.state.board[y][x];if(type){const block=this.makeBlock(x,y,BLOCK_COLORS[type],1,2);this.fixed.push(block);}}
    this.active.forEach((v)=>v.destroy());this.ghost.forEach((v)=>v.destroy());this.active=[];this.ghost=[];
    const gy=ghostY(this.state);for(const point of cellsOf({...this.state.active,y:gy})){this.ghost.push(this.makeBlock(point.x,point.y,BLOCK_COLORS[this.state.active.type],.18,1));}
    for(const point of cellsOf(this.state.active)){const block=this.makeBlock(point.x,point.y,BLOCK_COLORS[this.state.active.type],1,4);if(animate){block.y-=this.cellSize;this.tweens.add({targets:block,y:block.y+this.cellSize,duration:DUR.tap,ease:EASE.settle});}this.active.push(block);}
    this.scoreChip?.setText(t(this.locale,'game.score',{n:this.state.score}));this.linesChip?.setText(t(this.locale,'game.lines',{n:this.state.lines}));this.speedChip?.setText(t(this.locale,'game.level',{n:Math.floor(this.state.lines/8)+1}));
  }
  private makeBlock(x:number,y:number,color:number,alpha:number,depth:number){return this.add.rectangle(this.boardX+x*this.cellSize+this.cellSize/2,BOARD_Y+y*this.cellSize+this.cellSize/2,this.cellSize-3,this.cellSize-3,color,alpha).setStrokeStyle(1,C.white,.55).setDepth(depth);}
  private setPaused(reason:'host'|'hidden'|'sheet',paused:boolean){
    const wasPaused=this.pauseReasons.size>0;
    if(paused)this.pauseReasons.add(reason);else this.pauseReasons.delete(reason);
    const isPaused=this.pauseReasons.size>0;
    this.time.paused=isPaused;
    if(isPaused){this.held.clear();this.gestures.cancel();this.timer?.pause();if(!wasPaused){this.worldTweens=this.tweens.getTweens().filter(tween=>tween.isPlaying());this.worldTweens.forEach(tween=>tween.pause());}}
    else if(wasPaused){if(!this.finished&&!this.howto)this.timer?.resume();this.worldTweens.forEach(tween=>tween.resume());this.worldTweens=[];}
  }
  private goBack(){this.openPause();}
  private openPause(){
    if(this.finished||this.pauseSheet?.open)return;
    this.setPaused('sheet',true);
    this.pauseSheet=openPauseSheet(this,{locale:this.locale,kind:'run',summary:t(this.locale,'game.score',{n:this.state.score}),sound:{on:t(this.locale,'sound.on'),off:t(this.locale,'sound.off')},
      onResume:()=>{this.pauseSheet=undefined;this.setPaused('sheet',false);},
      onRestart:()=>{this.time.paused=false;this.scene.restart();},
      onExit:()=>this.exitToMenu(),
      onHowto:()=>{this.registry.set('howto',true);this.time.paused=false;this.scene.restart();}});
  }
  private exitToMenu(){this.finished=true;this.timer?.pause();this.fallEvent?.remove();this.time.paused=false;this.pauseSheet?.close();this.scene.start('MainMenu');}
  private endGame(){if(this.howto){this.scene.start('MainMenu');return;}this.timer?.pause();this.finished=true;const durationMs=Math.round(this.timer?.elapsedMs()??0);this.registry.set('rewardPromise',this.session?.finish({score:this.state.score,lines:this.state.lines,pieces:this.state.pieces,durationMs})??null);this.registry.set('lastGame',{locale:this.locale,score:this.state.score,lines:this.state.lines,pieces:this.state.pieces,durationMs});this.cameras.main.fadeOut(220,...COLORS.fade);this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('GameOver'));}
}
