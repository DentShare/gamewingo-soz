/**
 * Тонкая обёртка над localStorage. Хранилище может быть недоступно (приватный режим,
 * переполненная квота, WebView без доступа) — в этом случае игра обязана продолжать
 * работать, просто без сохранения. Поэтому здесь ни одна операция не бросает.
 */

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* квота / приватный режим — прогресс просто не сохранится */
  }
}
