import { SIZE } from './grid';

const KEY = '2048:best';

export function loadBest(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Сохраняет счёт, если он лучше прежнего. Возвращает true, если это новый рекорд. */
export function saveBest(score: number): boolean {
  const prev = loadBest();
  if (score <= prev) return false;
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    /* quota / приватный режим */
  }
  return true;
}

// ── Незаконченная партия («Продолжить») ──────────────────────────────────────

const SAVE_KEY = '2048:save';

/** Снимок партии: достаточен для полного восстановления ядра. */
export interface SavedGame {
  cells: number[][];
  score: number;
  moves: number;
  won: boolean;
}

/** Проверка формы снимка — данные из localStorage могут быть чужими/битыми. */
function isSavedGame(v: unknown): v is SavedGame {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<SavedGame>;
  if (!Array.isArray(s.cells) || s.cells.length !== SIZE) return false;
  for (const row of s.cells) {
    if (!Array.isArray(row) || row.length !== SIZE) return false;
    if (!row.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return false;
  }
  return (
    typeof s.score === 'number' && Number.isFinite(s.score)
    && typeof s.moves === 'number' && Number.isFinite(s.moves)
    && typeof s.won === 'boolean'
  );
}

/** Незаконченная партия или null (нет сохранения / битые данные / приватный режим). */
export function loadSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Сохраняет текущее состояние партии (вызывается после каждого результативного хода). */
export function saveGame(state: SavedGame): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cells: state.cells.map((row) => row.slice()),
      score: state.score,
      moves: state.moves,
      won: state.won,
    }));
  } catch {
    /* quota / приватный режим — тихо игнорируем */
  }
}

/** Убирает сохранение: партия закончена или начата новая. */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* приватный режим — тихо игнорируем */
  }
}

// ── Обучение ─────────────────────────────────────────────────────────────────

const ONBOARDED_KEY = '2048:onboarded';

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
