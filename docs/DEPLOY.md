# Деплой каталога на Vercel

Весь каталог (хаб + все игры) — **один Vercel-проект** `gamewingo-games`, привязанный к GitHub-репо.
Каждый мерж в `main` автоматически собирает и выкладывает production:

```
https://gamewingo-games.vercel.app/            ← хаб (hub/)
https://gamewingo-games.vercel.app/manifest.json
https://gamewingo-games.vercel.app/soz/        ← игры (games/<slug>/dist)
https://gamewingo-games.vercel.app/pairs/
https://gamewingo-games.vercel.app/fifteen/
https://gamewingo-games.vercel.app/2048/
https://gamewingo-games.vercel.app/sudoku-kids/
```

## Как это устроено

- Корневой `vercel.json`: `installCommand: npm install`, `buildCommand: npm run build:all`,
  `outputDirectory: dist-all`, immutable-кэш для `assets/` и `fonts/`.
- `npm run build:all` = сборка моста → сборка всех игр (`build:games`) →
  `scripts/build-catalog.mjs` складывает `hub/`, `games/manifest.json` и `games/<slug>/dist`
  в `dist-all/`.
- Игры собираются с `base: './'`, поэтому работают из подпапок без правок.
- localStorage-ключи игр обязаны иметь префикс `<slug>:` — все игры на одном origin.

## Настройки Vercel-проекта `gamewingo-games`

- Import репозитория `DentShare/gamewingo-soz`.
- **Root Directory:** корень репо (по умолчанию).
- Остальное подхватывается из корневого `vercel.json`.

## Добавление новой игры в каталог

1. Игра в `games/<slug>` собирается (`npm run build -w @gamewingo/<slug>`), ключи
   localStorage с префиксом `<slug>:`.
2. Добавить slug в `GAMES` в `scripts/build-catalog.mjs` и в `build:games` в корневом
   `package.json`.
3. Запись в `games/manifest.json` (url: `https://gamewingo-games.vercel.app/<slug>/`)
   и карточка в `hub/index.html`.
4. Мерж в `main` — деплой произойдёт автоматически.

## Проверка сборки локально (перед мержем)

```bash
npm run build:all
npx serve dist-all   # хаб на /, игры на /<slug>/
```

## Замечание про вес

Каждая игра ≈ 1.4 МБ на диске (по сети ~0.4 МБ с brotli — Phaser жмётся ~в 4 раза),
бюджет загрузки < 3 сек на 3G соблюдается. Общий вес каталога роли не играет —
игры грузятся по отдельности.

## Историческая справка

Ранее каждая игра деплоилась отдельным Vercel-проектом (`gamewingo-soz`, `soz-wingo`,
`gamewingo-hub`, `wingo-games`) — эти проекты можно удалить в дашборде после переключения
приложения на новые URL из `manifest.json`. Пер-игровые `games/<slug>/vercel.json`
оставлены на случай возврата к отдельным проектам, но в основной схеме не используются.
