# «soz» (Wordle-механика) — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать игру-угадайку слов (5 юнитов × 6 попыток) для RU и UZ-латиницы в `games/soz/`, подключённую к финтех-мосту, с диграф-осознанным ядром и режимами daily/practice.

**Architecture:** Чистое, тестируемое ядро (`src/core/`, без Phaser) + рендер-слой Phaser 4 (`src/game/scenes/`) + обёртка моста (`src/bridge/`). Логика (токенизация диграфов, оценка, слово дня, состояние партии, персистентность) юнит-тестируется на Vitest; сцены — тонкие потребители ядра.

**Tech Stack:** Phaser 4, TypeScript, Vite, Vitest, npm-workspaces; `@gamewingo/game-bridge`.

**Спека:** [`games/soz/SPEC.md`](../../../games/soz/SPEC.md) · **Дизайн:** [`docs/superpowers/specs/2026-07-24-soz-wordle-design.md`](../specs/2026-07-24-soz-wordle-design.md)

**Общие правила по ходу плана:**
- TDD: сначала падающий тест, потом минимальная реализация. Частые коммиты.
- Ноль хардкода пользовательских строк — только через i18n.
- Игра НЕ начисляет баллы — только шлёт факты в мост.
- Каждый источник (шаблон, шрифт, словарь) — строкой в [`docs/LICENSES.md`](../../LICENSES.md) до использования.
- Запуск тестов: `npm run test -w @gamewingo/soz`. Типы: `npm run typecheck -w @gamewingo/soz`.

---

## Task 1: Скаффолд игры из стартера + тест-раннер

**Files:**
- Create: `games/soz/` (копия стартера `template-vite-ts-main/template-vite-ts-main/`)
- Modify: `games/soz/package.json`
- Create: `games/soz/vitest.config.ts`
- Create: `games/soz/tsconfig.json` (наследует `tsconfig.base.json`)

- [ ] **Step 1: (если репозиторий ещё не под git) инициализировать git в корне**

```bash
cd "E:/Боты/Claude/GameWingo"
git rev-parse --is-inside-work-tree 2>/dev/null || git init
```

- [ ] **Step 2: Скопировать стартер в `games/soz` и вычистить лишнее**

Папка `games/soz/` уже существует (в ней заполненный `SPEC.md`). Стартер лежит вложенно — копируем
содержимое ВНУТРЕННЕЙ папки, сливая в существующую (SPEC.md стартера в шаблоне нет, так что ничего
не перезатрётся):

```bash
cd "E:/Боты/Claude/GameWingo"
cp -r template-vite-ts-main/template-vite-ts-main/. games/soz/
rm -rf games/soz/.git games/soz/node_modules games/soz/package-lock.json games/soz/log.js
```

(`games/soz/SPEC.md` уже заполнен — не трогаем.)

- [ ] **Step 3: Переписать `games/soz/package.json`**

```json
{
  "name": "@gamewingo/soz",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --config vite/config.dev.mjs",
    "build": "vite build --config vite/config.prod.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "phaser": "4.0.0",
    "@gamewingo/game-bridge": "*"
  },
  "devDependencies": {
    "typescript": "~5.7.2",
    "vite": "^6.3.1",
    "vitest": "^2.1.8",
    "terser": "^5.39.0"
  }
}
```

Также в dev/prod vite-конфигах стартера удалить обращение к `log.js`, если оно там осталось.

- [ ] **Step 4: Добавить `games/soz/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client", "vitest/globals"],
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

> `resolveJsonModule: true` обязателен — `dictionary.test.ts` и `i18n/index.ts` импортируют `*.json`;
> без него `tsc --noEmit` падает с TS2732 (Vitest соберёт и без него, но typecheck-гейт — нет).

- [ ] **Step 5: Добавить `games/soz/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

Добавить `jsdom` в devDependencies (`"jsdom": "^25.0.0"`) — нужен для тестов персистентности (localStorage).

- [ ] **Step 6: Установить зависимости и собрать мост**

```bash
cd "E:/Боты/Claude/GameWingo"
npm install
npm run bridge:build
```

Expected: установка без ошибок; `packages/game-bridge/dist/` появился.

- [ ] **Step 7: Дымовой тест — dev-сервер стартует**

```bash
npm run dev -w @gamewingo/soz
```

Expected: Vite поднимается, страница открывается (стоковый экран стартера). Останавливаем.

- [ ] **Step 8: Записать лицензию стартера в реестр**

В [`docs/LICENSES.md`](../../LICENSES.md), таблица «Код и шаблоны», добавить строку:

```
| soz | github.com/phaserjs/template-vite-ts | MIT | сохранён LICENSE + копирайт | 2026-07-24 | — |
```

- [ ] **Step 9: Commit**

```bash
git add games/soz docs/LICENSES.md
git commit -m "chore(soz): scaffold game from phaser starter + vitest"
```

---

## Task 2: Ядро — нормализация и токенизатор диграфов

**Files:**
- Create: `games/soz/src/core/locale.ts`
- Create: `games/soz/src/core/tokenizer.ts`
- Test: `games/soz/src/core/tokenizer.test.ts`

- [ ] **Step 1: Типы локали**

`games/soz/src/core/locale.ts`:

```ts
export type Locale = 'ru' | 'uz';

/** Диграфы узбекской латиницы — каждый считается одной «буквой-юнитом». */
export const UZ_DIGRAPHS = ['oʻ', 'gʻ', 'sh', 'ch', 'ng'] as const;

/** Длина слова в юнитах. */
export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;
```

- [ ] **Step 2: Написать падающий тест токенизатора**

`games/soz/src/core/tokenizer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeWord, tokenizeWord } from './tokenizer';

describe('normalizeWord', () => {
  it('нижний регистр и канонизация апострофа в ʻ (U+02BB)', () => {
    expect(normalizeWord("Oʼrik", 'uz')).toBe('oʻrik');
    expect(normalizeWord("O'RIK", 'uz')).toBe('oʻrik');
    expect(normalizeWord('O’rik', 'uz')).toBe('oʻrik');
  });
  it('ru: ё сводится к е', () => {
    expect(normalizeWord('ЁЛКА', 'ru')).toBe('елка');
  });
});

describe('tokenizeWord ru', () => {
  it('посимвольно', () => {
    expect(tokenizeWord('книга', 'ru')).toEqual(['к', 'н', 'и', 'г', 'а']);
  });
});

describe('tokenizeWord uz (диграфы)', () => {
  it('sh как один юнит', () => {
    expect(tokenizeWord('shahar', 'uz')).toEqual(['sh', 'a', 'h', 'a', 'r']);
  });
  it('oʻ как один юнит', () => {
    expect(tokenizeWord('oʻrik', 'uz')).toEqual(['oʻ', 'r', 'i', 'k']);
  });
  it('ng, ch, gʻ', () => {
    expect(tokenizeWord('gʻozch', 'uz')).toEqual(['gʻ', 'o', 'z', 'ch']);
    expect(tokenizeWord('tong', 'uz')).toEqual(['t', 'o', 'ng']);
  });
  it('жадный разбор: s+h всегда sh', () => {
    expect(tokenizeWord('mshaa', 'uz')).toEqual(['m', 'sh', 'a', 'a']);
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `npm run test -w @gamewingo/soz -- tokenizer`
Expected: FAIL (`normalizeWord`/`tokenizeWord` не определены).

- [ ] **Step 4: Реализовать токенизатор**

`games/soz/src/core/tokenizer.ts`:

```ts
import { UZ_DIGRAPHS, type Locale } from './locale';

/** Приводит слово к нормальной форме: нижний регистр + канонический ʻ (U+02BB); для ru ё→е. */
export function normalizeWord(word: string, locale: Locale): string {
  let w = word.toLowerCase();
  if (locale === 'uz') {
    w = w.replace(/['’ʼ`´]/g, 'ʻ'); // все варианты апострофа → U+02BB
  }
  if (locale === 'ru') {
    w = w.replace(/ё/g, 'е');
  }
  return w;
}

/** Режет НОРМАЛИЗОВАННОЕ или сырое слово на буквы-юниты (диграф-осознанно для uz). */
export function tokenizeWord(word: string, locale: Locale): string[] {
  const w = normalizeWord(word, locale);
  if (locale === 'ru') return Array.from(w);

  const units: string[] = [];
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    if ((UZ_DIGRAPHS as readonly string[]).includes(two)) {
      units.push(two);
      i += 2;
    } else {
      units.push(w[i]);
      i += 1;
    }
  }
  return units;
}
```

- [ ] **Step 5: Запустить тест — PASS**

Run: `npm run test -w @gamewingo/soz -- tokenizer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add games/soz/src/core/locale.ts games/soz/src/core/tokenizer.ts games/soz/src/core/tokenizer.test.ts
git commit -m "feat(soz): digraph-aware tokenizer + normalization"
```

---

## Task 3: Ядро — оценка попытки (evaluate)

**Files:**
- Create: `games/soz/src/core/evaluate.ts`
- Test: `games/soz/src/core/evaluate.test.ts`

- [ ] **Step 1: Падающий тест (двухпроходный алгоритм с дублями)**

`games/soz/src/core/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateGuess } from './evaluate';

describe('evaluateGuess (по юнитам)', () => {
  it('всё на месте', () => {
    expect(evaluateGuess(['к','н','и','г','а'], ['к','н','и','г','а']))
      .toEqual(['correct','correct','correct','correct','correct']);
  });
  it('всё мимо', () => {
    expect(evaluateGuess(['б','о','м','ж','ы'], ['к','н','и','г','а']))
      .toEqual(['absent','absent','absent','absent','absent']);
  });
  it('дубль в догадке при одном вхождении в ответе → только одна жёлтая/зелёная', () => {
    // ответ: 'аскет' (а,с,к,е,т); догадка: 'аабвг' — вторая 'а' лишняя
    expect(evaluateGuess(['а','а','б','в','г'], ['а','с','к','е','т']))
      .toEqual(['correct','absent','absent','absent','absent']);
  });
  it('present считается из оставшегося пула после correct', () => {
    // ответ: 'колба'; догадка: 'бокал' → все буквы есть, но не на местах
    expect(evaluateGuess(['б','о','к','а','л'], ['к','о','л','б','а']))
      .toEqual(['present','correct','present','present','present']);
  });
  it('работает на диграф-юнитах uz', () => {
    // ответ shahar=[sh,a,h,a,r]; догадка [h,a,sh,a,r]
    expect(evaluateGuess(['h','a','sh','a','r'], ['sh','a','h','a','r']))
      .toEqual(['present','correct','present','correct','correct']);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test -w @gamewingo/soz -- evaluate`
Expected: FAIL (`evaluateGuess` не определён).

- [ ] **Step 3: Реализовать**

`games/soz/src/core/evaluate.ts`:

```ts
export type UnitStatus = 'correct' | 'present' | 'absent';

/** Классический Wordle-алгоритм, но по юнитам. guess и answer — массивы одинаковой длины. */
export function evaluateGuess(guess: string[], answer: string[]): UnitStatus[] {
  const n = answer.length;
  const result: UnitStatus[] = new Array(n).fill('absent');
  const pool = new Map<string, number>();

  // Проход 1: correct + учёт остатка в пуле
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct';
    } else {
      pool.set(answer[i], (pool.get(answer[i]) ?? 0) + 1);
    }
  }
  // Проход 2: present из оставшегося пула
  for (let i = 0; i < n; i++) {
    if (result[i] === 'correct') continue;
    const left = pool.get(guess[i]) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      pool.set(guess[i], left - 1);
    }
  }
  return result;
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test -w @gamewingo/soz -- evaluate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/soz/src/core/evaluate.ts games/soz/src/core/evaluate.test.ts
git commit -m "feat(soz): two-pass guess evaluation over units"
```

---

## Task 4: Ядро — слово дня (детерминизм)

**Files:**
- Create: `games/soz/src/core/dailyWord.ts`
- Test: `games/soz/src/core/dailyWord.test.ts`

- [ ] **Step 1: Падающий тест (пин формул из спеки)**

`games/soz/src/core/dailyWord.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDayId, dailyIndex, pickDailyWord } from './dailyWord';

describe('computeDayId', () => {
  it('целые дни по Asia/Tashkent (UTC+5)', () => {
    // 2026-07-24T00:00:00Z + 5ч = того же дня; проверяем стабильность формулы
    const ms = Date.UTC(2026, 6, 24, 0, 0, 0);
    expect(computeDayId(ms)).toBe(Math.floor((ms + 5 * 3600 * 1000) / 86_400_000));
  });
});

describe('dailyIndex', () => {
  it('детерминирован: один dayId → один индекс', () => {
    expect(dailyIndex(20000, 150)).toBe(dailyIndex(20000, 150));
  });
  it('в диапазоне [0, len)', () => {
    for (let d = 0; d < 500; d++) {
      const idx = dailyIndex(d, 37);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(37);
    }
  });
});

describe('pickDailyWord', () => {
  it('возвращает слово из списка по dayId', () => {
    const answers = ['aaaaa', 'bbbbb', 'ccccc'];
    const w = pickDailyWord(answers, 12345);
    expect(answers).toContain(w);
    expect(pickDailyWord(answers, 12345)).toBe(w); // стабильно
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `npm run test -w @gamewingo/soz -- dailyWord`
Expected: FAIL.

- [ ] **Step 3: Реализовать (формулы строго как в спеке §3.3)**

`games/soz/src/core/dailyWord.ts`:

```ts
const TASHKENT_OFFSET_MS = 5 * 3600 * 1000; // UTC+5, без DST
const DAY_MS = 86_400_000;

/** Номер дня по таймзоне Asia/Tashkent. nowMs по умолчанию Date.now(). Сервер считает так же. */
export function computeDayId(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + TASHKENT_OFFSET_MS) / DAY_MS);
}

/** Детерминированный 32-битный fmix-хэш dayId → индекс в [0, len). */
export function dailyIndex(dayId: number, len: number): number {
  let h = dayId >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % len;
}

export function pickDailyWord(answers: string[], dayId: number = computeDayId()): string {
  return answers[dailyIndex(dayId, answers.length)];
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `npm run test -w @gamewingo/soz -- dailyWord`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add games/soz/src/core/dailyWord.ts games/soz/src/core/dailyWord.test.ts
git commit -m "feat(soz): deterministic daily word (Tashkent dayId + fmix index)"
```

---

## Task 5: Данные — MVP-словари + валидация

**Files:**
- Create: `games/soz/src/data/answers.ru.json`, `allowed.ru.json`
- Create: `games/soz/src/data/answers.uz.json`, `allowed.uz.json`
- Create: `games/soz/src/core/dictionary.ts`
- Test: `games/soz/src/core/dictionary.test.ts`
- Modify: `docs/LICENSES.md`

- [ ] **Step 1: Завести стартовые списки (сид ~30–40 слов; расширить до ~150 в конце задачи)**

Все слова — нормализованные (нижний регистр; ru без ё; uz с ʻ=U+02BB), ровно 5 юнитов.
`answers` и `allowed` **дизъюнктны**. Сид `answers.ru.json` (валидный JSON, расширить до ~150):

```json
["книга","слово","город","весна","порог","берег","корка","манка","полка","рынок",
 "сокол","волна","дрель","крыло","масло","песня","ветка","штора","плита","груша",
 "халат","бидон","товар","замок","совок","марка","банан","дупло","карта","струя"]
```

Сид `answers.uz.json` (узбекская латиница, только слова, дающие ровно 5 юнитов — прогнать валидатором):

```json
["shahar","daryo","paxta","tuxum","bahor","salom","kitob","dunyo","havas","bodom",
 "tarix","gilos","quyon","yomon","suvli"]
```

> Внимание: слова с диграфами часто дают <5 юнитов (`oʻrik`→`oʻ,r,i,k`=4; `chana`→`ch,a,n,a`=4),
> поэтому в answers их без добора не кладём — валидатор (Step 2) их отсеет. Это и есть причина иметь тест:
> при наполнении он не даст добавить слово неверной длины.

`allowed.<loc>.json` — более широкий набор валидных догадок, **не пересекающийся** с `answers`.
Валидатор из Step 2 (ровно 5 юнитов, дизъюнктность, отсутствие дублей) — страховка от кривых слов
при наполнении: любое слово, не токенизирующееся в 5 юнитов, завалит тест.

- [ ] **Step 2: Падающий тест-валидатор (гарантия корректности словарей)**

`games/soz/src/core/dictionary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadDictionary } from './dictionary';
import { tokenizeWord } from './tokenizer';
import { WORD_LENGTH, type Locale } from './locale';
import ansRu from '../data/answers.ru.json';
import alwRu from '../data/allowed.ru.json';
import ansUz from '../data/answers.uz.json';
import alwUz from '../data/allowed.uz.json';

const sets: Record<Locale, { answers: string[]; allowed: string[] }> = {
  ru: { answers: ansRu, allowed: alwRu },
  uz: { answers: ansUz, allowed: alwUz },
};

describe.each(['ru', 'uz'] as Locale[])('словарь %s', (loc) => {
  it('каждое слово ответов — ровно 5 юнитов', () => {
    for (const w of sets[loc].answers) {
      expect(tokenizeWord(w, loc).length, w).toBe(WORD_LENGTH);
    }
  });
  it('каждое слово догадок — ровно 5 юнитов', () => {
    for (const w of sets[loc].allowed) {
      expect(tokenizeWord(w, loc).length, w).toBe(WORD_LENGTH);
    }
  });
  it('answers и allowed дизъюнктны', () => {
    const a = new Set(sets[loc].answers);
    for (const w of sets[loc].allowed) expect(a.has(w), w).toBe(false);
  });
  it('нет дублей в answers', () => {
    expect(new Set(sets[loc].answers).size).toBe(sets[loc].answers.length);
  });
});

describe('loadDictionary', () => {
  it('has() = объединение answers ∪ allowed', () => {
    const d = loadDictionary('ru', ansRu, alwRu);
    expect(d.has(ansRu[0])).toBe(true);
    expect(d.has('щщщщщ')).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить — FAIL (и словарь, и loadDictionary)**

Run: `npm run test -w @gamewingo/soz -- dictionary`
Expected: FAIL. Если падает валидатор слов — почистить JSON (это и есть цель: тест ловит кривые слова).

- [ ] **Step 4: Реализовать loader + починить словари, пока тест не позеленеет**

`games/soz/src/core/dictionary.ts`:

```ts
import { normalizeWord, tokenizeWord } from './tokenizer';
import { WORD_LENGTH, type Locale } from './locale';

export interface Dictionary {
  has(word: string): boolean;
  answers: string[];
}

export function loadDictionary(locale: Locale, answers: string[], allowed: string[]): Dictionary {
  const union = new Set<string>([...answers, ...allowed].map((w) => normalizeWord(w, locale)));
  return {
    answers,
    has(word: string) {
      const w = normalizeWord(word, locale);
      return tokenizeWord(w, locale).length === WORD_LENGTH && union.has(w);
    },
  };
}
```

Итерационно правим `data/*.json`, пока валидатор не станет зелёным.

- [ ] **Step 5: Запустить — PASS**

Run: `npm run test -w @gamewingo/soz -- dictionary`
Expected: PASS.

- [ ] **Step 6: Расширить answers до ~150 и allowed до рабочего объёма (тест держит инвариант)**

Дополнять списки, периодически гоняя тест — он не даст добавить кривое слово.

- [ ] **Step 7: Записать источники словарей в LICENSES.md**

Для каждого внешнего источника — строка в таблице (или пометка «оригинальная курация, авторские права команды»). Прогнать через скилл `license-check` при использовании внешних списков.

- [ ] **Step 8: Commit**

```bash
git add games/soz/src/data games/soz/src/core/dictionary.ts games/soz/src/core/dictionary.test.ts docs/LICENSES.md
git commit -m "feat(soz): MVP dictionaries (ru/uz) + validating loader"
```

---

## Task 6: Ядро — состояние партии (gameState)

**Files:**
- Create: `games/soz/src/core/gameState.ts`
- Test: `games/soz/src/core/gameState.test.ts`

Отвечает за: текущий ряд/попытки, применение догадки, статус партии (`in_progress`/`won`/`lost`),
агрегированные статусы клавиш (для подсветки клавиатуры), сбор `rows` для `meta`.

- [ ] **Step 1: Падающий тест**

`games/soz/src/core/gameState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createGame } from './gameState';

const answer = ['к','н','и','г','а'];

describe('gameState', () => {
  it('победа при точном совпадении', () => {
    const g = createGame(answer);
    const r = g.submit(['к','н','и','г','а']);
    expect(r.statuses).toEqual(['correct','correct','correct','correct','correct']);
    expect(g.status).toBe('won');
    expect(g.guessesUsed).toBe(1);
  });
  it('проигрыш после MAX_GUESSES неверных', () => {
    const g = createGame(answer);
    for (let i = 0; i < 6; i++) g.submit(['б','о','м','ж','ы']);
    expect(g.status).toBe('lost');
    expect(g.rows.length).toBe(6);
  });
  it('агрегированные статусы клавиш: correct перебивает present', () => {
    const g = createGame(answer);
    g.submit(['к','к','к','к','к']); // к correct на позиции 0
    expect(g.letterStatus('к')).toBe('correct');
    expect(g.letterStatus('б')).toBeUndefined(); // не вводили — клавиша не подсвечена
  });
  it('нельзя ходить после конца', () => {
    const g = createGame(answer);
    g.submit(['к','н','и','г','а']);
    expect(() => g.submit(['б','о','м','ж','ы'])).toThrow();
  });
});
```

- [ ] **Step 2: FAIL**

Run: `npm run test -w @gamewingo/soz -- gameState`

- [ ] **Step 3: Реализовать**

`games/soz/src/core/gameState.ts`:

```ts
import { evaluateGuess, type UnitStatus } from './evaluate';
import { MAX_GUESSES } from './locale';

export type GameStatus = 'in_progress' | 'won' | 'lost';
export interface Row { units: string[]; statuses: UnitStatus[]; }

const RANK: Record<UnitStatus, number> = { absent: 0, present: 1, correct: 2 };

export interface Game {
  readonly answer: string[];
  status: GameStatus;
  readonly rows: Row[];
  readonly guessesUsed: number;
  submit(guess: string[]): Row;
  letterStatus(unit: string): UnitStatus | undefined;
}

export function createGame(answer: string[]): Game {
  const rows: Row[] = [];
  const keyStatus = new Map<string, UnitStatus>();
  let status: GameStatus = 'in_progress';

  return {
    answer,
    get status() { return status; },
    set status(s) { status = s; },
    rows,
    get guessesUsed() { return rows.length; },
    submit(guess) {
      if (status !== 'in_progress') throw new Error('game already finished');
      const statuses = evaluateGuess(guess, answer);
      const row: Row = { units: guess.slice(), statuses };
      rows.push(row);
      guess.forEach((u, i) => {
        const prev = keyStatus.get(u);
        if (prev === undefined || RANK[statuses[i]] > RANK[prev]) keyStatus.set(u, statuses[i]);
      });
      if (statuses.every((s) => s === 'correct')) status = 'won';
      else if (rows.length >= MAX_GUESSES) status = 'lost';
      return row;
    },
    letterStatus(unit) { return keyStatus.get(unit); },
  };
}
```

- [ ] **Step 4: PASS**

Run: `npm run test -w @gamewingo/soz -- gameState`

- [ ] **Step 5: Commit**

```bash
git add games/soz/src/core/gameState.ts games/soz/src/core/gameState.test.ts
git commit -m "feat(soz): game state machine (rows, key statuses, win/lose)"
```

---

## Task 7: Ядро — score, персистентность, анти-реплей

**Files:**
- Create: `games/soz/src/core/score.ts`
- Create: `games/soz/src/core/persistence.ts`
- Test: `games/soz/src/core/score.test.ts`, `games/soz/src/core/persistence.test.ts`

- [ ] **Step 1: Падающий тест score (формула + max=9000 + кламп)**

`games/soz/src/core/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeScore } from './score';

describe('computeScore', () => {
  it('не решено → 0', () => {
    expect(computeScore({ solved: false, guessesUsed: 3, durationMs: 1000 })).toBe(0);
  });
  it('max = 9000 при 1 попытке ~0 сек', () => {
    expect(computeScore({ solved: true, guessesUsed: 1, durationMs: 0 })).toBe(9000);
  });
  it('штраф за попытки и время', () => {
    expect(computeScore({ solved: true, guessesUsed: 2, durationMs: 10_000 })).toBe(10000 - 2000 - 10);
  });
  it('кламп в ≥0', () => {
    expect(computeScore({ solved: true, guessesUsed: 6, durationMs: 9_000_000 })).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: FAIL → реализовать `score.ts`**

```ts
export interface ScoreInput { solved: boolean; guessesUsed: number; durationMs: number; }

export function computeScore({ solved, guessesUsed, durationMs }: ScoreInput): number {
  if (!solved) return 0;
  const durationSec = Math.floor(durationMs / 1000);
  return Math.max(0, 10000 - guessesUsed * 1000 - Math.min(durationSec, 999));
}
```

- [ ] **Step 3: PASS score.**

- [ ] **Step 4: Падающий тест персистентности (jsdom localStorage)**

`games/soz/src/core/persistence.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveDaily, loadDaily, dailyKey } from './persistence';

beforeEach(() => localStorage.clear());

describe('persistence daily', () => {
  it('save/load round-trip по (locale, dayId)', () => {
    const state = { rows: [], status: 'in_progress' as const, rewardClaimed: false };
    saveDaily('ru', 20000, state);
    expect(loadDaily('ru', 20000)).toEqual(state);
  });
  it('ключи изолированы по локали и дню', () => {
    expect(dailyKey('ru', 1)).not.toBe(dailyKey('uz', 1));
    expect(dailyKey('ru', 1)).not.toBe(dailyKey('ru', 2));
  });
  it('нет записи → null', () => {
    expect(loadDaily('ru', 999)).toBeNull();
  });
});
```

- [ ] **Step 5: FAIL → реализовать `persistence.ts`**

```ts
import type { Row } from './gameState';
import type { GameStatus } from './gameState';
import type { Locale } from './locale';

export interface DailyState { rows: Row[]; status: GameStatus; rewardClaimed: boolean; }

export function dailyKey(locale: Locale, dayId: number): string {
  return `soz:${locale}:${dayId}`;
}
export function saveDaily(locale: Locale, dayId: number, state: DailyState): void {
  try { localStorage.setItem(dailyKey(locale, dayId), JSON.stringify(state)); } catch { /* quota/off */ }
}
export function loadDaily(locale: Locale, dayId: number): DailyState | null {
  try {
    const raw = localStorage.getItem(dailyKey(locale, dayId));
    return raw ? (JSON.parse(raw) as DailyState) : null;
  } catch { return null; }
}
```

- [ ] **Step 6: PASS persistence.**

- [ ] **Step 7: Commit**

```bash
git add games/soz/src/core/score.ts games/soz/src/core/persistence.ts games/soz/src/core/*.test.ts
git commit -m "feat(soz): score formula + daily persistence/anti-replay"
```

---

## Task 8: Локализация (i18n)

**Files:**
- Create: `games/soz/src/i18n/ru.json`, `games/soz/src/i18n/uz.json`
- Create: `games/soz/src/i18n/index.ts`
- Test: `games/soz/src/i18n/i18n.test.ts`

- [ ] **Step 1: Падающий тест — паритет ключей и наличие обязательных строк**

`games/soz/src/i18n/i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import ru from './ru.json';
import uz from './uz.json';
import { t } from './index';

const REQUIRED = [
  'app.title','menu.daily','menu.practice','menu.howto','game.invalidWord','game.notInList',
  'result.won','result.lost','result.answerWas','result.share','result.claim','result.streak',
  'result.leaderboard','error.network','a11y.highContrast',
];

describe('i18n', () => {
  it('ru и uz имеют одинаковый набор ключей', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(uz).sort());
  });
  it('все обязательные ключи присутствуют', () => {
    for (const k of REQUIRED) { expect(ru).toHaveProperty(k); expect(uz).toHaveProperty(k); }
  });
  it('t() достаёт строку и подставляет параметры', () => {
    expect(t('ru','result.answerWas',{word:'книга'})).toContain('книга');
  });
});
```

- [ ] **Step 2: FAIL → создать словари строк (плоские ключи) и `index.ts`**

`ru.json` / `uz.json` — плоские объекты `{"app.title":"5 букв", ...}` со ВСЕМИ ключами из `REQUIRED`
(+ по мере надобности). Строки с параметрами используют `{name}`-плейсхолдеры,
напр. `"result.answerWas":"Слово было: {word}"`.

`games/soz/src/i18n/index.ts`:

```ts
import ru from './ru.json';
import uz from './uz.json';
import type { Locale } from '../core/locale';

const DICTS: Record<Locale, Record<string, string>> = { ru, uz };

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const tpl = DICTS[locale][key] ?? DICTS.ru[key] ?? key;
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}
```

- [ ] **Step 3: PASS i18n.**

- [ ] **Step 4: Commit**

```bash
git add games/soz/src/i18n
git commit -m "feat(soz): i18n (ru/uz) with key-parity test"
```

---

## Task 9: Обёртка моста + сессия

**Files:**
- Create: `games/soz/src/bridge/session.ts`
- Test: `games/soz/src/bridge/session.test.ts`

Инкапсулирует `@gamewingo/game-bridge`: хранит `INIT`-данные (locale, theme, token, apiBaseUrl, sessionId),
таймер сессии (START→OVER), и правило «submitScore только для daily».

- [ ] **Step 1: Падающий тест с мок-мостом**

`games/soz/src/bridge/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createSession } from './session';

function fakeBridge() {
  return {
    ready: vi.fn(), start: vi.fn(), gameOver: vi.fn(), claimReward: vi.fn(),
    track: vi.fn(), error: vi.fn(), onApp: vi.fn(() => () => {}), destroy: vi.fn(),
  };
}

describe('session', () => {
  it('daily: gameOver + submitScore вызываются', async () => {
    const b = fakeBridge();
    const api = { submitScore: vi.fn(async () => ({ accepted: true, pointsAwarded: 50 })), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit({ type:'INIT', authToken:'t', apiBaseUrl:'x', locale:'ru', sessionId:'sess', });
    s.start();
    await s.finish({ mode:'daily', dayId:1, guessesUsed:2, solved:true, durationMs:5000, rows:[] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitScore).toHaveBeenCalledWith(expect.objectContaining({ gameId:'soz', sessionId:'sess' }));
  });
  it('practice: gameOver есть, submitScore НЕ вызывается', async () => {
    const b = fakeBridge();
    const api = { submitScore: vi.fn(), leaderboard: vi.fn() };
    const s = createSession(b as any, () => api as any);
    s.applyInit({ type:'INIT', authToken:'t', apiBaseUrl:'x', locale:'ru', sessionId:'sess' });
    s.start();
    await s.finish({ mode:'practice', dayId:1, guessesUsed:3, solved:true, durationMs:5000, rows:[] });
    expect(b.gameOver).toHaveBeenCalled();
    expect(api.submitScore).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: FAIL → реализовать `session.ts`**

Опирается на типы из `@gamewingo/game-bridge` (`GameBridge`, `ApiClient`, `AppToGameEvent`). Ключевое:
`finish()` всегда шлёт `bridge.gameOver(score, sessionId, durationMs)` и `track`, но `api.submitScore`
дергает только при `mode==='daily'`. Возвращает результат submitScore (превью), либо null для practice.

```ts
import type {
  GameBridge, ApiClient, AppToGameEvent, BrandTheme, LeaderboardEntry,
} from '@gamewingo/game-bridge';
import { computeScore } from '../core/score';
import type { Locale } from '../core/locale';
import type { Row } from '../core/gameState';

export interface FinishInput {
  mode: 'daily' | 'practice'; dayId: number; locale?: Locale;
  guessesUsed: number; solved: boolean; durationMs: number; rows: Row[];
}
export type RewardResult = { rewardId: string; granted: boolean; points?: number };

export interface Session {
  locale: Locale; theme?: BrandTheme; sessionId: string; ready(): void;
  applyInit(e: Extract<AppToGameEvent, { type: 'INIT' }>): void;
  start(): void;
  finish(input: FinishInput): Promise<{ accepted: boolean; pointsAwarded?: number } | null>;
  claim(rewardId: string): void;
  /** Лидерборд по слову дня (per-locale фильтр — на сервере). Пустой массив при ошибке/деве. */
  leaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Подписка на REWARD_RESULT от приложения. Возвращает функцию отписки. */
  onReward(cb: (r: RewardResult) => void): () => void;
  /** Проброс PAUSE/RESUME (и др.) наверх — для игрового таймера. Возвращает отписку. */
  onApp(cb: (e: AppToGameEvent) => void): () => void;
}

export function createSession(bridge: GameBridge, makeApi: (base: string, token: string) => ApiClient): Session {
  let locale: Locale = 'ru';
  let theme: BrandTheme | undefined;
  let sessionId = 'local-dev';
  let api: ApiClient | null = null;

  return {
    get locale() { return locale; }, get theme() { return theme; }, get sessionId() { return sessionId; },
    ready() { bridge.ready(); },
    applyInit(e) {
      locale = (e.locale === 'uz' ? 'uz' : 'ru');
      theme = e.theme; sessionId = e.sessionId;
      api = makeApi(e.apiBaseUrl, e.authToken);
    },
    start() { bridge.start(sessionId); },
    async finish(input) {
      const score = computeScore(input);
      bridge.gameOver(score, sessionId, input.durationMs);
      bridge.track('round_finished', { mode: input.mode, solved: input.solved });
      if (input.mode !== 'daily' || !api) return null;
      try {
        return await api.submitScore({
          sessionId, gameId: 'soz', score, durationMs: input.durationMs,
          meta: { dayId: input.dayId, guessesUsed: input.guessesUsed, solved: input.solved, rows: input.rows, locale },
        });
      } catch (err) { bridge.error(String(err)); return null; }
    },
    claim(rewardId) { bridge.claimReward(rewardId, sessionId); },
    async leaderboard(limit = 10) {
      if (!api) return [];
      try { return await api.leaderboard('soz', limit); } catch (err) { bridge.error(String(err)); return []; }
    },
    onReward(cb) {
      return bridge.onApp((e) => {
        if (e.type === 'REWARD_RESULT') cb({ rewardId: e.rewardId, granted: e.granted, points: e.points });
      });
    },
    onApp(cb) { return bridge.onApp(cb); },
  };
}
```

Добавить в тест Task 9 покрытие `leaderboard()` (мок `api.leaderboard`) и `onReward()` (мок `bridge.onApp`
вызывает cb при `REWARD_RESULT`).

- [ ] **Step 3: PASS session.**

- [ ] **Step 4: Commit**

```bash
git add games/soz/src/bridge
git commit -m "feat(soz): bridge session (INIT, submitScore gated to daily)"
```

---

## Task 10: Phaser — конфиг под мобильный portrait + Boot

**Files:**
- Modify: `games/soz/src/game/main.ts`
- Rewrite: `games/soz/src/game/scenes/Boot.ts`
- Delete лишние стоковые сцены позже (Preloader переиспользуем/упростим)

- [ ] **Step 1: Портретный конфиг игры**

`main.ts`: `scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 400, height: 720 }`,
`backgroundColor` из дефолтной тёмной палитры; список сцен: `[Boot, MainMenu, Game, GameOver]`
(оставляем стоковые имена классов `Game`/`GameOver` из стартера; в Tasks 12–13 переписываем их
**содержимое**, не переименовывая класс — сцена `Game` = игровое поле, `GameOver` = экран результата).
Удаляем неиспользуемую стоковую `Preloader.ts` из списка сцен и её файл (шрифт/ассеты грузим в Boot).

- [ ] **Step 2: Boot подключает мост и ждёт INIT**

`Boot.ts`:
- создаёт `createBridge()` и `createSession(bridge, (base,token)=>createApiClient({baseUrl:base,authToken:token}))`;
- `session.applyInit` по событию `INIT` (через `bridge.onApp`); если INIT не пришёл за N мс (веб-дев) —
  дефолт `locale='ru'`, мок-режим;
- применяет `theme` (цвета фона/акцентов) в реестр (`this.registry.set('theme', ...)`, `registry.set('session', session)`);
- вызывает `session.ready()` (шлёт `GAME_READY`);
- переходит в `MainMenu`.

- [ ] **Step 3: Ручная проверка в браузере (webapp-testing)**

Использовать скилл `webapp-testing`/Playwright: `npm run dev`, открыть, убедиться что нет ошибок в консоли,
`GAME_READY` ушёл (лог в mock-режиме), фон портретный.

- [ ] **Step 4: Commit**

```bash
git add games/soz/src/game/main.ts games/soz/src/game/scenes/Boot.ts
git commit -m "feat(soz): portrait game config + Boot bridge/init wiring"
```

---

## Task 11: Phaser — MainMenu (режимы, how-to, палитра/дальтонизм)

**Files:**
- Rewrite: `games/soz/src/game/scenes/MainMenu.ts`

- [ ] **Step 1: Экран меню**

- Заголовок из `t(locale,'app.title')`, лого из `theme.logoUrl` (ленивая загрузка, фолбэк — текст).
- Кнопки: «Ежедневное» (`menu.daily`), «Тренировка» (`menu.practice`), «Как играть» (`menu.howto`),
  переключатель high-contrast (`a11y.highContrast`).
- Выбор режима кладёт `registry.set('mode', 'daily'|'practice')` и стартует `GameScene`.
- Тап-таргеты ≥ 40px.

- [ ] **Step 2: Ручная проверка** — кнопки кликаются, локализованы, режим прокидывается.

- [ ] **Step 3: Commit**

```bash
git add games/soz/src/game/scenes/MainMenu.ts
git commit -m "feat(soz): main menu (modes, how-to, contrast toggle)"
```

---

## Task 12: Phaser — GameScene (сетка + клавиатура + ввод)

**Files:**
- Rewrite содержимое: `games/soz/src/game/scenes/Game.ts` (класс остаётся `Game`)
- Create: `games/soz/src/game/keyboards.ts` (раскладки RU/UZ из спеки §3.4)
- Create: `games/soz/src/game/palette.ts` (цвета плиток; обычная + high-contrast)

- [ ] **Step 1: Раскладки и палитра (чистые данные — можно юнит-тестом на длину рядов)**

`keyboards.ts`: экспорт `KEYBOARD_RU` и `KEYBOARD_UZ` как массивы рядов строк; спецклавиши `ENTER`, `BACKSPACE`;
для UZ ряд диграфов `['oʻ','gʻ','sh','ch','ng']`. `palette.ts`: `{correct,present,absent}` для normal и
high-contrast (оранжевый/синий).

- [ ] **Step 2: Сборка партии из ядра**

При входе: собрать `dictionary = loadDictionary(locale, answers, allowed)`; выбрать слово:
`mode==='daily' ? pickDailyWord(dictionary.answers, dayId) : случайное (≠ daily)`; `createGame(tokenize(word))`.
Для daily — восстановить прогресс через `loadDaily`; если уже завершено → сразу сцена `GameOver`.

- [ ] **Step 3: Игровой таймер с паузой (`createRoundTimer`) — чистый, юнит-тестируемый**

`games/soz/src/game/roundTimer.ts` (или в `core/`): аккумулирует активное время партии, исключая паузы.
Падающий тест → реализация:

```ts
export function createRoundTimer(now: () => number) {
  let startedAt: number | null = null;
  let acc = 0;         // накоплено до текущего активного отрезка
  let running = false;
  return {
    start() { startedAt = now(); running = true; },
    pause() { if (running && startedAt !== null) { acc += now() - startedAt; running = false; } },
    resume() { if (!running) { startedAt = now(); running = true; } },
    elapsedMs() { return acc + (running && startedAt !== null ? now() - startedAt : 0); },
  };
}
```

Тест: старт→+1000мс→pause→(время идёт)→resume→+500мс ⇒ `elapsedMs ≈ 1500` (паузу не считаем).

- [ ] **Step 4: Рендер и ввод**

- **Начало отсчёта — пин:** `session.start()` и `timer.start()` вызываются **при входе в сцену `Game`**
  (не на первом submit). `durationMs` = `timer.elapsedMs()` в момент завершения (от START, без пауз).
- Подписка `session.onApp` на `PAUSE`→`timer.pause()` и `RESUME`→`timer.resume()` (+ приостановка анимаций).
- Сетка 6×`WORD_LENGTH` плиток; ввод с экранной клавиатуры добавляет юнит (диграф-клавиша = один юнит),
  `BACKSPACE` убирает юнит целиком, `ENTER` подтверждает.
- Валидация: `tokenize(current).length===5 && dictionary.has(current)`; иначе тряска ряда + тост
  `game.notInList` + `bridge.track('invalid_word')`, попытка не тратится.
- На валидной догадке: `game.submit(units)` → анимация переворота плиток с цветами палитры, обновление
  цвета клавиш по `game.letterStatus`; `bridge.track('guess_submitted', {n})`.
- **По завершению партии (won/lost):**
  1. `saveDaily(locale, dayId, {rows, status, rewardClaimed:false})` (только daily);
  2. **вызвать `session.finish({ mode, dayId, locale, guessesUsed, solved, durationMs: timer.elapsedMs(), rows })`**
     — для daily это шлёт `GAME_OVER` + `submitScore` (превью очков); результат кладём в
     `registry.set('lastGame', { ...итог, scorePreview })`;
  3. перейти на сцену `GameOver`.

- [ ] **Step 5: Ручная проверка (webapp-testing)** — сыграть партию RU и UZ (диграф-ввод, backspace, пауза).

- [ ] **Step 6: Commit**

```bash
git add games/soz/src/game/scenes/Game.ts games/soz/src/game/keyboards.ts games/soz/src/game/palette.ts games/soz/src/game/roundTimer.ts
git commit -m "feat(soz): game scene — grid, keyboard, digraph input, pause-aware timer, finish()"
```

---

## Task 13: Phaser — ResultScene (итог, стрик, шэринг, лидерборд, награда)

**Files:**
- Rewrite содержимое: `games/soz/src/game/scenes/GameOver.ts` (класс остаётся `GameOver`, роль — экран результата)
- Create: `games/soz/src/game/share.ts` (эмодзи-грид)

- [ ] **Step 1: Падающий тест `buildShareText` (чистая функция)**

`games/soz/src/game/share.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildShareText } from './share';

describe('buildShareText', () => {
  it('маппит статусы в 🟩🟨⬛ и даёт строку на каждый ряд, без слова Wordle', () => {
    const rows = [
      { units: ['к','н','и','г','а'], statuses: ['correct','absent','present','correct','absent'] as const },
    ];
    const txt = buildShareText(rows as any, { solved: true, guessesUsed: 1, dayId: 20000, title: '5 harf' });
    expect(txt).toContain('🟩⬛🟨🟩⬛');
    expect(txt.toLowerCase()).not.toContain('wordle');
    expect(txt.split('\n').filter((l) => /[🟩🟨⬛]/.test(l)).length).toBe(1);
  });
});
```

- [ ] **Step 2: FAIL → реализовать `share.ts`**

`buildShareText(rows, { solved, guessesUsed, dayId, title })`: заголовок `${title} #${dayId} ${solved?guessesUsed:'X'}/6`
(БЕЗ слова «Wordle») + по строке `🟩/🟨/⬛` на каждый ряд из `rows`. PASS.

- [ ] **Step 3: Экран результата (сцена `GameOver`)**

- `result.won`/`result.lost` + `result.answerWas {word}` (если проигрыш). Данные — из `registry.get('lastGame')`.
- Стрик 🔥 (значение из ответа сервера/лидерборда, если есть; иначе скрыть).
- Кнопка «Поделиться» → `session`-обёртка шлёт `GAME_EVENT('share_result',{text})` (+ `navigator.clipboard` фолбэк).
- Для `daily`+solved: `session.finish(...)` уже вызван в сцене `Game` (превью очков лежит в `lastGame.scorePreview`);
  кнопка «Забрать награду» (`result.claim`) → `session.claim(rewardId)`; подписка `session.onReward((r)=>...)`
  → показать `r.points`; при `granted` выставить `rewardClaimed=true` через `saveDaily` (анти-реплей).
- Лидерборд (`result.leaderboard`): `await session.leaderboard()` (per-locale фильтр — на сервере), рендер топа;
  пустой массив (ошибка/дев) → показать `error.network`, мягкий фолбэк.

- [ ] **Step 5: Ручная проверка** — daily победа: виден шэринг, кнопка награды; practice: награды нет.

- [ ] **Step 6: Commit**

```bash
git add games/soz/src/game/scenes/GameOver.ts games/soz/src/game/share.ts games/soz/src/game/share.test.ts
git commit -m "feat(soz): result scene — streak, share, leaderboard, reward claim"
```

---

## Task 14: Шрифт, вес билда, финальная сборка

**Files:**
- Create: `games/soz/public/fonts/` (сабсет-шрифт с покрытием кириллица+латиница+ʻ) + `@font-face` в стилях
- Modify: `docs/LICENSES.md` (лицензия шрифта)

- [ ] **Step 1: Подключить шрифт** с покрытием нужных глифов (напр. открытый Noto/Inter/Rubik), сабсетнуть под
  используемые символы; `@font-face` в CSS/через Phaser. Записать лицензию шрифта в LICENSES.md.
- [ ] **Step 2: Прод-билд и вес**

```bash
npm run build -w @gamewingo/soz
```

Проверить итоговый размер `games/soz/dist` — цель <2 МБ, потолок <5 МБ. Ужать шрифт/ассеты при превышении.

- [ ] **Step 3: Typecheck игры**

```bash
npm run typecheck -w @gamewingo/soz
```

Expected: 0 ошибок. (Корневой `npm run typecheck` = `tsc -b` не покрывает soz — она не в `references`;
полагаемся на workspace-typecheck игры. Требует `resolveJsonModule` из Task 1.)

- [ ] **Step 4: Commit**

```bash
git add games/soz/public games/soz/**/*.css docs/LICENSES.md
git commit -m "chore(soz): bundle subset font + build-size pass"
```

---

## Task 15: WebView-QA + запись в манифест каталога

- [ ] **Step 1: Прогнать чеклист скилла `webview-qa`** (вес, fps, тач, офлайн, отсутствие рекламы/сторонней
  аналитики, поведение при PAUSE/RESUME, анти-реплей daily).
- [ ] **Step 2: Проверить финтех-контракт скиллом `fintech-bridge`** (события, gating submitScore, порядок награды).
- [ ] **Step 3: Отметить пункты DoD в `games/soz/SPEC.md`** (§5, §6).
- [ ] **Step 4: Деплой на Vercel** (статический билд) и запись игры в манифест каталога.
- [ ] **Step 5: Финальный commit**

```bash
git add -A
git commit -m "chore(soz): webview QA pass + catalog manifest entry"
```

---

## Порядок и зависимости

Ядро (Tasks 2–9) не зависит от Phaser и делается/тестируется первым — это снимает главный риск (диграфы,
детерминизм, gating наград). Сцены (10–13) — тонкие потребители ядра. 14–15 — упаковка и сдача.

## Известные упрощения MVP (из спеки)

- Только длина 5; словари MVP-объёма; EN вне рамок; слово дня может повторяться; слова с раздельными
  `s+h`/`n+g` не поддерживаются (курация ответов).
