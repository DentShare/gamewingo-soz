import ru from './ru.json';
import uz from './uz.json';
import type { Locale } from '../core/locale';

const DICTS: Record<Locale, Record<string, string>> = { ru, uz };

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const tpl = DICTS[locale][key] ?? DICTS.ru[key] ?? key;
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}
