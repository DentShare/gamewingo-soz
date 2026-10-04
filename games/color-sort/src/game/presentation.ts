import { levelAt } from '../core/levels';
import type { Locale } from '../core/locale';
import { t } from '../i18n';
export function levelIntro(locale: Locale, n: number): string {
  const level = levelAt(n);
  return t(locale, level.intro ?? 'intro.start', { tubes: level.tubes.length, colors: level.colors });
}
export function activeTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
