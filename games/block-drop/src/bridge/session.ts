import {reportResult} from '@gamewingo/game-bridge';
import type {GameBridge,ApiClient,AppToGameEvent,BrandTheme,LeaderboardEntry} from '@gamewingo/game-bridge';
import type {Locale} from '../core/locale';
import {safeScore} from '../core/score';
export interface FinishInput{score:number;lines:number;pieces:number;durationMs:number;}
export interface Session{locale:Locale;theme?:BrandTheme;sessionId:string;ready():void;applyInit(e:Extract<AppToGameEvent,{type:'INIT'}>):void;start():void;finish(input:FinishInput):Promise<{accepted:boolean;pointsAwarded?:number}|null>;exit():void;leaderboard(limit?:number):Promise<LeaderboardEntry[]>;onApp(cb:(e:AppToGameEvent)=>void):()=>void;}
export function createSession(bridge:GameBridge,makeApi:(base:string,token:string)=>ApiClient):Session{
  let locale:Locale='ru',theme:BrandTheme|undefined,sessionId='local-dev',api:ApiClient|null=null;
  return{get locale(){return locale;},get theme(){return theme;},get sessionId(){return sessionId;},ready(){bridge.ready();},applyInit(e){locale=e.locale==='uz'?'uz':'ru';theme=e.theme;sessionId=e.sessionId;api=makeApi(e.apiBaseUrl,e.authToken);},start(){bridge.start(sessionId);},async finish(input){const score=safeScore(input.score);bridge.gameOver(score,sessionId,input.durationMs);bridge.track('round_finished',{lines:input.lines,pieces:input.pieces});return reportResult(bridge,api,{game:'block-drop',mode:'endless',score,durationMs:input.durationMs,sessionId,metrics:{lines:input.lines,pieces:input.pieces}});},exit(){bridge.exit(sessionId);},async leaderboard(limit=10){if(!api)return[];try{return await api.leaderboard('block-drop',limit);}catch(err){bridge.error(String(err));return[];}},onApp(cb){return bridge.onApp(cb);}};
}
