import {Scene} from 'phaser';
import type {Locale} from '../../core/locale';
import {t} from '../../i18n';
import {makeButton,applyTheme,setupCamera,createGameHeader,guardBrowserBack,makeGameIcon,makeRecordBadge,makeSoundToggle} from '../ui';
import {COLORS,FONT} from '../palette';
import {DPR} from '../dpr';
import {loadBests} from '@gamewingo/game-progress';
import type {Session} from '../../bridge/session';
const CX=200,SLUG='block-drop',HUB_URL='../';
export class MainMenu extends Scene{
  private locale:Locale='ru';
  constructor(){super('MainMenu');}
  create(){
    this.locale=(this.registry.get('locale') as Locale)??'ru';applyTheme(this);setupCamera(this);this.cameras.main.fadeIn(200,...COLORS.fade);
    createGameHeader(this,{title:t(this.locale,'app.title'),chips:[],onBack:()=>this.exitToCatalog()});makeGameIcon(this,CX,118,82);
    const offBack=guardBrowserBack(()=>this.exitToCatalog());this.events.once('shutdown',offBack);
    const bests=loadBests(SLUG);makeRecordBadge(this,CX,210,{value:String(Math.round(bests.score??0)),label:t(this.locale,'menu.record')});
    this.add.text(CX,286,t(this.locale,'menu.linesBest',{n:Math.round(bests.lines??0)}),{fontFamily:FONT,fontSize:15,color:COLORS.headMuted}).setOrigin(.5).setResolution(DPR);
    makeButton(this,CX,360,t(this.locale,'menu.play'),()=>this.startRun(),{primary:true});
    makeButton(this,CX,416,t(this.locale,'menu.howto'),()=>this.showHowto());
    makeSoundToggle(this,CX,480,{on:t(this.locale,'sound.on'),off:t(this.locale,'sound.off')});
  }
  private startRun(){this.registry.set('locale',this.locale);this.scene.start('Game');}
  private showHowto(){this.registry.set('howto',true);this.registry.set('locale',this.locale);this.scene.start('Game');}
  private exitToCatalog(){const session=this.registry.get('session') as Session|undefined;session?.exit();if(this.registry.get('demo'))window.location.href=(this.registry.get('catalogUrl') as string)||HUB_URL;}
}
