import ru from './ru.json';
import uz from './uz.json';

export type Locale = 'ru' | 'uz';
const dictionaries: Record<Locale, Record<string, string>> = { ru, uz };
export function t(locale: Locale, key: string, params: Record<string, number | string> = {}) {
  return (dictionaries[locale][key] ?? dictionaries.ru[key] ?? key)
    .replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
