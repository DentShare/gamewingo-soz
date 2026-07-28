# Деплой каталога на Vercel

Весь каталог (хаб + все игры) — **один Vercel-проект**, привязанный к GitHub-репо.
Каждый мерж в `main` автоматически собирает и выкладывает production:

```
https://gamewingo-soz.vercel.app/            ← хаб (hub/)
https://gamewingo-soz.vercel.app/manifest.json
https://gamewingo-soz.vercel.app/soz/        ← игры (games/<slug>/dist)
https://gamewingo-soz.vercel.app/pairs/
https://gamewingo-soz.vercel.app/fifteen/
https://gamewingo-soz.vercel.app/2048/
https://gamewingo-soz.vercel.app/sudoku-kids/
```

## Как это устроено

- `npm run build:all` = сборка моста → сборка всех игр (`build:games`) →
  `scripts/build-catalog.mjs` складывает `hub/`, `games/manifest.json` и `games/<slug>/dist`
  в `dist-all/`.
- Игры собираются с `base: './'`, поэтому работают из подпапок без правок.
- Внутриигровая ссылка «К играм» — относительная (`../`), поэтому не зависит от домена.
- localStorage-ключи игр обязаны иметь префикс `<slug>:` — все игры на одном origin.

## Действующий проект: `gamewingo-soz`

Исторически у него **Root Directory = `games/soz`**, поэтому Vercel читает
`games/soz/vercel.json`. Этот конфиг собирает каталог из корня монорепо и кладёт
результат в `games/soz/dist` — туда, где проект ждёт выход:

```
buildCommand: cd ../.. && npm run build:all && rm -rf games/soz/dist && cp -r dist-all games/soz/dist
outputDirectory: dist
```

## Если создавать отдельный проект под каталог

Корневой `vercel.json` собирает тот же каталог для проекта с **Root Directory = корень репо**
(`buildCommand: npm run build:all`, `outputDirectory: dist-all`). Достаточно импортировать репо
в дашборде и не менять Root Directory. После этого обновить URL в `games/manifest.json`.

Альтернатива без нового проекта: переименовать проект `gamewingo-soz`
(Settings → Project Name) — сменится и домен `*.vercel.app`; URL в манифесте обновить.

> ⚠️ `vercel.json` **не допускает произвольных полей** — только из схемы. Ключ вроде
> `$comment` роняет деплой на валидации ещё до сборки
> («should NOT have additional property»). Комментарии — только здесь, в доках.

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
