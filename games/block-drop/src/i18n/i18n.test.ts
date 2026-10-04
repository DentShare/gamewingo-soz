import {describe,it,expect} from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import {t} from './index';
const REQUIRED=['sound.on','sound.off','app.title','menu.play','menu.howto','menu.catalog','menu.record','game.score','game.lines','game.rotate','game.drop','game.hint','result.title','result.score','result.detail','result.newBest','result.playAgain','result.menu','error.network','onboarding.take','onboarding.drop','onboarding.goal'];
describe('i18n (block-drop)',()=>{
  it('keeps RU and UZ keys equal',()=>expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort()));
  it('contains required copy',()=>{for(const key of REQUIRED){expect(ru).toHaveProperty(key);expect(uz).toHaveProperty(key);}});
  it('contains no empty strings',()=>{for(const dict of [ru,uz])for(const [key,value] of Object.entries(dict))expect(value.trim().length,key).toBeGreaterThan(0);});
  it('substitutes parameters',()=>{expect(t('ru','game.score',{n:42})).toBe('Очки: 42');expect(t('uz','game.lines',{n:3})).toContain('3');});
});
