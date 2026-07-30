# Реестр лицензий

Обязательная практика: по каждому форкнутому шаблону и каждому ассету — строка в таблице.
Реестр входит в поставку клиенту (снимает юридические вопросы). Заполнять ДО начала работы над игрой.

## Шпаргалка по лицензиям

| Лицензия | В закрытый коммерческий продукт | Условие |
|---|---|---|
| MIT / Apache 2.0 / BSD | ✅ Да | Сохранить файл лицензии и копирайт автора в коде |
| CC0 | ✅ Да | Без условий |
| CC-BY | ✅ Да | Указать автора (экран «Об игре») |
| CC-BY-NC | ❌ Нет | Запрет коммерческого использования |
| GPL / AGPL | ❌ Нет | Обязывает раскрыть исходники — исключаем полностью |
| CodeCanyon Regular | ✅ Да, 1 продукт | Конечный продукт бесплатен для пользователей |
| CodeCanyon Extended | ✅ Да, 1 продукт | Если доступ к продукту платный |

## Код и шаблоны

| Игра / модуль | Источник (URL) | Лицензия | Условия к исполнению | Дата проверки | Проверил |
|---|---|---|---|---|---|
| _(пример)_ match3 | github.com/.../phaser-match3 | MIT | сохранён LICENSE + копирайт в src | 2026-07-22 | — |
| soz | github.com/phaserjs/template-vite-ts | MIT | сохранён `games/soz/LICENSE` + копирайт Phaser Studio | 2026-07-24 | — |
| soz · confetti | github.com/catdad/canvas-confetti | MIT | сохранить копирайт в NOTICE | 2026-07-25 | — |
| soz · словарь RU (allowed) | github.com/danakt/russian-words | MIT | сохранить копирайт; отфильтровано до 5-букв, нормализовано | 2026-07-25 | — |
| soz · словарь UZ | оригинальная курация (латиница, 5 юнитов) | — (собственная) | без сторонних прав; факты-слова | 2026-07-25 | — |
| pairs | github.com/phaserjs/template-vite-ts (через структуру soz) | MIT | сохранён `games/pairs/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| pairs · confetti | github.com/catdad/canvas-confetti | MIT | сохранить копирайт в NOTICE | 2026-07-28 | — |
| fifteen | github.com/phaserjs/template-vite-ts (через структуру pairs) | MIT | сохранён `games/fifteen/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| 2048 | github.com/phaserjs/template-vite-ts (через структуру pairs); механика 2048 — реализация с нуля | MIT | сохранён `games/2048/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| sudoku-kids | github.com/phaserjs/template-vite-ts (через структуру pairs); генератор судоку — собственный | MIT | сохранён `games/sudoku-kids/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| stack (аркада) | github.com/phaserjs/template-vite-ts (через структуру pairs); механика реализована с нуля | MIT | сохранён `games/stack/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| flyer (аркада) | github.com/phaserjs/template-vite-ts (через структуру pairs); механика реализована с нуля, чужие ассеты/названия не используются | MIT | сохранён `games/flyer/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| targets (аркада) | github.com/phaserjs/template-vite-ts (через структуру pairs); механика реализована с нуля | MIT | сохранён `games/targets/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| snake (аркада) | github.com/phaserjs/template-vite-ts (через структуру pairs); механика — публичная классика, реализация с нуля | MIT | сохранён `games/snake/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| sorting (детская) | github.com/phaserjs/template-vite-ts (через структуру pairs); фигурки и корзины — собственная векторная отрисовка | MIT | сохранён `games/sorting/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
| counting (детская) | github.com/phaserjs/template-vite-ts (через структуру pairs); механика реализована с нуля | MIT | сохранён `games/counting/LICENSE` + копирайт Phaser Studio | 2026-07-28 | — |
|  |  |  |  |  |  |

## Ассеты (графика, звук, шрифты)

| Ассет | Источник | Лицензия | Условия (атрибуция?) | Использован в | Дата | Проверил |
|---|---|---|---|---|---|---|
| _(пример)_ UI-кит | kenney.nl | CC0 | без условий | все игры | 2026-07-22 | — |
| Системный шрифт (SF Pro / Roboto) | ОС устройства | — (не бандлится) | ничего не поставляем — рендер ОС | все игры каталога | 2026-07-30 | — |
| Иконки игр (изометрия) | собственная отрисовка, генератор `scripts/gen-icons.mjs` | — (собственная) | без сторонних прав | каталог и меню игр | 2026-07-30 | — |
| Запасные плоские значки | собственная векторная отрисовка (`packages/game-ui/src/glyphs.ts`) | — (собственная) | без сторонних прав | игры, фолбэк каталога | 2026-07-29 | — |
|  |  |  |  |  |  |  |

## Запрещено к использованию

Не включать в продукт ничего под **GPL / AGPL / CC-BY-NC** и любыми «non-commercial» условиями.
Если сомнение в лицензии — не использовать до выяснения.
