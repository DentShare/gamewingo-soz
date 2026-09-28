import type { CatalogLocale } from './locale.js';

/**
 * Общие подписи виджетов дизайн-системы: одинаковые во всех играх, поэтому
 * переводятся один раз здесь, а не в четырнадцати словарях. Всё, что зависит
 * от механики (названия глав, рычаги, пороги звёзд), остаётся в словаре игры.
 */
const DICT: Record<CatalogLocale, Record<string, string>> = {
  ru: {
    'next.caption': 'Следующий',
    'next.improve': 'Улучшить до трёх звёзд',
    'next.level': 'Уровень {n}',
    'next.play': 'Играть',
    'intro': 'Новое: {text}',
    'stars': '★ {s} / {m}',
    'chapter.title': 'Глава {n} · {title}',
    'chapter.progress': '{k} из {n} · за главу +{bonus}',
    'chapter.done': 'Пройдена · ★ {s} / {m}',
    'chapter.locked': 'после главы {n}',
    'daily.title': 'Уровень дня',
    'daily.ready': 'Новый расклад каждый день · +{bonus}',
    'daily.locked': 'Новый расклад каждый день · +{bonus} · после уровня {n}',
    'daily.done': 'Пройден · завтра новый расклад',
    'daily.play': 'Играть',
    'pause.title': 'Пауза',
    'pause.resume': 'Продолжить',
    'pause.restart': 'Начать уровень заново',
    'pause.restartRun': 'Начать заново',
    'pause.exit': 'Выйти — прогресс уровня не сохранится',
    'pause.exitRun': 'Выйти — забег не засчитается',
    'pause.howto': 'Как играть',
    'pause.timerStopped': 'Таймер остановлен',
    'pause.left': 'осталось {t}',
  },
  uz: {
    'next.caption': 'Keyingisi',
    'next.improve': 'Uch yulduzgacha yaxshilang',
    'next.level': '{n}-daraja',
    'next.play': 'Oʻynash',
    'intro': 'Yangi: {text}',
    'stars': '★ {s} / {m}',
    'chapter.title': '{n}-bob · {title}',
    'chapter.progress': '{n} dan {k} · bob uchun +{bonus}',
    'chapter.done': 'Oʻtildi · ★ {s} / {m}',
    'chapter.locked': '{n}-bobdan keyin',
    'daily.title': 'Kun darajasi',
    'daily.ready': 'Har kuni yangi joylashuv · +{bonus}',
    'daily.locked': 'Har kuni yangi joylashuv · +{bonus} · {n}-darajadan keyin',
    'daily.done': 'Oʻtildi · ertaga yangi joylashuv',
    'daily.play': 'Oʻynash',
    'pause.title': 'Pauza',
    'pause.resume': 'Davom etish',
    'pause.restart': 'Darajani qaytadan boshlash',
    'pause.restartRun': 'Qaytadan boshlash',
    'pause.exit': 'Chiqish — daraja natijasi saqlanmaydi',
    'pause.exitRun': 'Chiqish — oʻyin hisoblanmaydi',
    'pause.howto': 'Qanday oʻynash',
    'pause.timerStopped': 'Taymer toʻxtatildi',
    'pause.left': '{t} qoldi',
  },
};

/** Подпись виджета на языке игрока; `{name}` подставляются из `vars`. */
export function uiText(locale: string, key: string, vars: Record<string, string | number> = {}): string {
  const dict = DICT[locale === 'uz' ? 'uz' : 'ru'];
  const raw = dict[key] ?? DICT.ru[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Для проверки паритета словарей: ключи обеих локалей. */
export const UI_TEXT_KEYS = { ru: Object.keys(DICT.ru), uz: Object.keys(DICT.uz) };

/**
 * Форма слова после числа: «1 пара», «3 пары», «9 пар». В узбекском существительное
 * после числительного не меняется — там все три ключа словаря одинаковые.
 * Игра держит в словаре `<ключ>.one/.few/.many` и выбирает по этой функции.
 */
export function pluralForm(n: number): 'one' | 'few' | 'many' {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}
