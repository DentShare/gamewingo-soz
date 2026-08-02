/** Флаг пройденного обучения. Рекорды и звёзды уровней ведёт @gamewingo/game-progress. */
const ONBOARDED_KEY = 'fifteen:onboarded';

/** Прошёл ли игрок обучение (показываем один раз, при первой партии). */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}
