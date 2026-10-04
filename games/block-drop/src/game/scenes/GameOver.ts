import {Scene} from 'phaser';
import type {Locale} from '../../core/locale';
import {t} from '../../i18n';
import {makeButton,applyTheme,setupCamera,makeBonusChip,playSound,makePhoenix,EASE,DUR} from '../ui';
import {COLORS,FONT} from '../palette';
import {DPR} from '../dpr';
import {recordArcadeRound,dailyMissions,grantArcadeBonuses} from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';
interface LastGame{locale:Locale;score:number;lines:number;pieces:number;durationMs:number;}
const CX=200,SLUG='block-drop';
export class GameOver extends Scene{
  constructor(){super('GameOver');}
  create(){
    applyTheme(this);setupCamera(this);this.cameras.main.fadeIn(220,...COLORS.fade);const last=this.registry.get('lastGame') as LastGame;
    const missionsBefore=dailyMissions();const round=recordArcadeRound({slug:SLUG,defs:[],metrics:{lines:last.lines,pieces:last.pieces},score:last.score});
    const bonus=grantArcadeBonuses({slug:SLUG,closed:[],milestones:[],missionsBefore});const chip=makeBonusChip(this,386,30);if(bonus.total>0){chip.setValue(bonus.balance-bonus.total);this.time.delayedCall(850,()=>{playSound('coin');chip.award(bonus.total,CX,190);});}
    const record=round.records.improved.includes('score');playSound(record?'win':'lose');if(record)confetti({disableForReducedMotion:true,particleCount:85,spread:70,origin:{y:.4}});
    const title=this.add.text(CX,104,t(last.locale,'result.title'),{fontFamily:FONT,fontSize:30,color:COLORS.headText,fontStyle:'bold'}).setOrigin(.5).setResolution(DPR).setAlpha(0).setScale(.7);this.tweens.add({targets:title,alpha:1,scale:1,duration:DUR.appear,ease:EASE.pop});
    this.appear(this.add.text(CX,166,t(last.locale,'result.score',{score:last.score}),{fontFamily:FONT,fontSize:28,color:COLORS.headText,fontStyle:'bold'}).setOrigin(.5).setResolution(DPR),220);
    this.appear(this.add.text(CX,208,t(last.locale,'result.detail',{lines:last.lines,pieces:last.pieces}),{fontFamily:FONT,fontSize:16,color:COLORS.headMuted}).setOrigin(.5).setResolution(DPR),300);
    if(record)this.appear(this.add.text(CX,250,t(last.locale,'result.newBest'),{fontFamily:FONT,fontSize:17,color:COLORS.headText,fontStyle:'bold'}).setOrigin(.5).setResolution(DPR),380);
    const again=makeButton(this,CX,340,t(last.locale,'result.playAgain'),()=>this.scene.start('Game'),{primary:true});this.appear(again.root,480);const menu=makeButton(this,CX,396,t(last.locale,'result.menu'),()=>this.scene.start('MainMenu'));this.appear(menu.root,540);
    const phoenix=makePhoenix(this,322,648,84,{facing:'left'});this.time.delayedCall(300,()=>record?phoenix.celebrate():phoenix.sink());this.events.once('shutdown',()=>phoenix.destroy());
  }
  private appear(obj:{y:number;setAlpha(a:number):unknown},delay:number){const y=obj.y;obj.setAlpha(0);obj.y=y+14;this.tweens.add({targets:obj as object,y,alpha:1,duration:DUR.appear,delay,ease:EASE.settle});}
}
