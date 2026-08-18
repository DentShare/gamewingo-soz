import { describe, it, expect, beforeEach } from 'vitest';
import { preferredLocale, rememberLocale, LANG_KEY } from './locale';

function setSearch(search: string): void {
  window.history.replaceState({}, '', `/sums/${search}`);
}

describe('язык каталога', () => {
  beforeEach(() => {
    localStorage.clear();
    setSearch('');
  });

  it('по умолчанию русский', () => {
    expect(preferredLocale()).toBe('ru');
  });

  it('берёт язык, выбранный в хабе', () => {
    localStorage.setItem(LANG_KEY, 'uz');
    expect(preferredLocale()).toBe('uz');
  });

  it('?lang в адресе сильнее памяти хаба', () => {
    localStorage.setItem(LANG_KEY, 'uz');
    setSearch('?lang=ru');
    expect(preferredLocale()).toBe('ru');
  });

  it('чужой язык игнорируется — каталог знает только ru и uz', () => {
    localStorage.setItem(LANG_KEY, 'en');
    expect(preferredLocale()).toBe('ru');
    setSearch('?lang=tr');
    expect(preferredLocale()).toBe('ru');
  });

  it('регистр и пробелы не мешают', () => {
    setSearch('?lang=%20UZ%20');
    expect(preferredLocale()).toBe('uz');
  });

  it('выбор внутри игры запоминается для хаба и остальных игр', () => {
    rememberLocale('uz');
    expect(localStorage.getItem(LANG_KEY)).toBe('uz');
    expect(preferredLocale()).toBe('uz');
  });

  it('ручное переключение обновляет ?lang в адресе — иначе перезагрузка вернёт старый язык', () => {
    setSearch('?lang=uz');
    rememberLocale('ru');
    expect(window.location.search).toBe('?lang=ru');
    expect(preferredLocale()).toBe('ru');
  });

  it('без ?lang в адресе параметр не появляется', () => {
    setSearch('');
    rememberLocale('uz');
    expect(window.location.search).toBe('');
  });
});
