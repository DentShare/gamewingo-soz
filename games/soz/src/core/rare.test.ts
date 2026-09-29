import { describe, it, expect } from 'vitest';
import { rareAnswers, RARE_MIN } from './rare';
import ansRu from '../data/answers.ru.json';
import alwRu from '../data/allowed.ru.json';
import ansUz from '../data/answers.uz.json';
import alwUz from '../data/allowed.uz.json';

describe('редкие слова', () => {
  it('поднабор ответов, треть списка, но не меньше минимума', () => {
    const rare = rareAnswers(ansRu, alwRu, 'ru');
    expect(rare.length).toBe(Math.max(RARE_MIN, Math.round(ansRu.length / 3)));
    for (const w of rare) expect(ansRu).toContain(w);
    expect(new Set(rare).size).toBe(rare.length);
    const uz = rareAnswers(ansUz, alwUz, 'uz');
    expect(uz.length).toBeGreaterThanOrEqual(RARE_MIN);
    for (const w of uz) expect(ansUz).toContain(w);
  });

  it('детерминирован и не зависит от порядка ответов', () => {
    const a = rareAnswers(ansRu, alwRu, 'ru');
    expect(rareAnswers([...ansRu].reverse(), alwRu, 'ru').sort()).toEqual([...a].sort());
    expect(rareAnswers(ansRu, alwRu, 'ru')).toEqual(a);
  });

  it('берёт слова с редкими буквами, а не с частыми', () => {
    // Слово из букв, которых больше нигде нет, — самое редкое.
    const answers = ['арена', 'ранее', 'аорта', 'карта', 'норка', 'щупыш', 'нарок', 'крона', 'роман'];
    const rare = rareAnswers(answers, ['ананас', 'барабан', 'корона'], 'ru');
    expect(rare[0]).toBe('щупыш');
  });

  it('короткий список отдаётся целиком', () => {
    expect(rareAnswers(['книга', 'слово'], [], 'ru').sort()).toEqual(['книга', 'слово']);
  });
});
