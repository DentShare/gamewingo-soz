/**
 * Язык каталога: один выбор на хаб и на все игры.
 *
 * Хаб — статический HTML и держит выбор в localStorage под ключом `wingoHubLang`.
 * Игры лежат на том же домене (`/<slug>/`), поэтому читают тот же ключ: переключил
 * язык в хабе — игра открылась на нём же, а не по-русски. Внутри приложения язык
 * приходит в INIT от хоста, и этот запасной путь не используется вовсе.
 */

export type CatalogLocale = 'ru' | 'uz';

/** Ключ выбора языка. Его задаёт хаб — менять только вместе с `hub/index.html`. */
export const LANG_KEY = 'wingoHubLang';

const KNOWN: readonly string[] = ['ru', 'uz'];

function normalize(value: string | null | undefined): CatalogLocale | null {
  const v = (value ?? '').trim().toLowerCase();
  return KNOWN.includes(v) ? (v as CatalogLocale) : null;
}

/**
 * С каким языком открывать игру вне приложения: сначала `?lang=` в адресе
 * (явная ссылка сильнее памяти — по ней удобно слать игру на проверку),
 * затем выбор в хабе, затем запасной.
 */
export function preferredLocale(fallback: CatalogLocale = 'ru'): CatalogLocale {
  try {
    const fromQuery = normalize(new URLSearchParams(window.location.search).get('lang'));
    if (fromQuery) return fromQuery;
  } catch {
    /* нет window — значит и адреса нет */
  }
  try {
    const stored = normalize(localStorage.getItem(LANG_KEY));
    if (stored) return stored;
  } catch {
    /* приватный режим — читать нечего */
  }
  return fallback;
}

/**
 * Запомнить выбор игрока: хаб и остальные игры откроются на этом же языке.
 *
 * Заодно чиним адрес: если игру открыли по ссылке с `?lang=`, а игрок переключил
 * язык руками, старый параметр обновляется. Иначе после перезагрузки страницы
 * вернулся бы язык из ссылки, и переключатель выглядел бы сломанным.
 */
export function rememberLocale(locale: CatalogLocale): void {
  try {
    localStorage.setItem(LANG_KEY, locale);
  } catch {
    /* квота / приватный режим — просто не запомним */
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang') && url.searchParams.get('lang') !== locale) {
      url.searchParams.set('lang', locale);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    /* нет window — адрес править нечему */
  }
}
