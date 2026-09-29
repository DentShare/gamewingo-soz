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
    'pause.exitSaved': 'Выйти — партия сохранится',
    'pause.howto': 'Как играть',
    'pause.timerStopped': 'Таймер остановлен',
    'pause.left': 'осталось {t}',
    'result.levelChapter': 'Уровень {n} · Глава {k}',
    'result.dailyLevel': 'Уровень дня',
    'result.almostStar': 'До третьей звезды — {gap}',
    'result.again': 'Ещё раз',
    'result.menu': 'В меню',
    'result.next': 'Уровень {n}',
    'result.nextIntro': 'Уровень {n} · новое: {intro}',
    'result.run': 'Забег · {t}',
    'result.newRecord': 'Новый рекорд · {v}',
    'result.recordChip': 'рекорд {v}',
    'result.almostChallenge': 'Почти! Испытание {n}',
    'result.challengeDone': 'Испытание {n} пройдено',
    'result.thisRun': 'В этом забеге: {v}',
    'result.thisRunMissing': 'В этом забеге: {v} · не хватило {m}',
    'result.following': 'Следом',
    'result.upTo': 'до +{n}',
    'result.moreRun': 'Ещё забег',
    'bonus.total': 'Начислено',
    'bonus.level': 'Первое прохождение уровня {n}',
    'bonus.challenge': 'Испытание {n}',
    'bonus.chapter': 'Глава {n} пройдена',
    'bonus.levelOfDay': 'Уровень дня',
    'bonus.recordWeek': 'Рекорд недели',
    'bonus.daily': 'Слово дня',
    'bonus.mission': 'Задание дня: {text}',
    'bonus.other': 'Бонус',
    'mission.levels.one': 'пройти {n} уровень',
    'mission.levels.few': 'пройти {n} уровня',
    'mission.levels.many': 'пройти {n} уровней',
    'mission.stars.one': 'собрать {n} звезду',
    'mission.stars.few': 'собрать {n} звезды',
    'mission.stars.many': 'собрать {n} звёзд',
    'mission.score.one': 'набрать {n} очко',
    'mission.score.few': 'набрать {n} очка',
    'mission.score.many': 'набрать {n} очков',
    'mission.variety.one': 'сыграть в {n} разную игру',
    'mission.variety.few': 'сыграть в {n} разные игры',
    'mission.variety.many': 'сыграть в {n} разных игр',
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
    'pause.exitSaved': 'Chiqish — oʻyin saqlanadi',
    'pause.howto': 'Qanday oʻynash',
    'pause.timerStopped': 'Taymer toʻxtatildi',
    'pause.left': '{t} qoldi',
    'result.levelChapter': '{n}-daraja · {k}-bob',
    'result.dailyLevel': 'Kun darajasi',
    'result.almostStar': 'Uchinchi yulduzgacha — {gap}',
    'result.again': 'Qaytadan',
    'result.menu': 'Menyuga',
    'result.next': '{n}-daraja',
    'result.nextIntro': '{n}-daraja · yangi: {intro}',
    'result.run': 'Oʻyin · {t}',
    'result.newRecord': 'Yangi rekord · {v}',
    'result.recordChip': 'rekord {v}',
    'result.almostChallenge': 'Oz qoldi! {n}-sinov',
    'result.challengeDone': '{n}-sinov bajarildi',
    'result.thisRun': 'Bu oʻyinda: {v}',
    'result.thisRunMissing': 'Bu oʻyinda: {v} · {m} yetmadi',
    'result.following': 'Keyingisi',
    'result.upTo': '+{n} gacha',
    'result.moreRun': 'Yana oʻynash',
    'bonus.total': 'Hisoblandi',
    'bonus.level': '{n}-daraja birinchi marta oʻtildi',
    'bonus.challenge': '{n}-sinov',
    'bonus.chapter': '{n}-bob oʻtildi',
    'bonus.levelOfDay': 'Kun darajasi',
    'bonus.recordWeek': 'Hafta rekordi',
    'bonus.daily': 'Kun soʻzi',
    'bonus.mission': 'Kun vazifasi: {text}',
    'bonus.other': 'Bonus',
    'mission.levels.one': '{n} ta darajani oʻtish',
    'mission.levels.few': '{n} ta darajani oʻtish',
    'mission.levels.many': '{n} ta darajani oʻtish',
    'mission.stars.one': '{n} ta yulduz yigʻish',
    'mission.stars.few': '{n} ta yulduz yigʻish',
    'mission.stars.many': '{n} ta yulduz yigʻish',
    'mission.score.one': '{n} ochko toʻplash',
    'mission.score.few': '{n} ochko toʻplash',
    'mission.score.many': '{n} ochko toʻplash',
    'mission.variety.one': '{n} xil oʻyin oʻynash',
    'mission.variety.few': '{n} xil oʻyin oʻynash',
    'mission.variety.many': '{n} xil oʻyin oʻynash',
  },
};

/** Подпись виджета на языке игрока; `{name}` подставляются из `vars`. */
export function uiText(locale: string, key: string, vars: Record<string, string | number> = {}): string {
  const dict = DICT[locale === 'uz' ? 'uz' : 'ru'];
  const raw = dict[key] ?? DICT.ru[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Подпись с числом: `<key>.one/.few/.many` по `pluralForm(n)`. */
export function uiPlural(locale: string, key: string, n: number, vars: Record<string, string | number> = {}): string {
  return uiText(locale, `${key}.${pluralForm(n)}`, { n, ...vars });
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
