# Деплой игры на Vercel

Каждая игра каталога — отдельный статический билд на Vercel (отдельный Vercel-проект).
Так новые игры добавляются без релиза приложения — через манифест `games/manifest.json`.

## Настройки Vercel-проекта для `soz`

Игра — часть npm-workspaces монорепо и зависит от `@gamewingo/game-bridge`, поэтому установка и
сборка моста должны идти из корня. Конфиг лежит в `games/soz/vercel.json`:

- **Root Directory:** `games/soz`
- **Install Command:** `cd ../.. && npm install`
- **Build Command:** `cd ../.. && npm run bridge:build && npm run build -w @gamewingo/soz`
- **Output Directory:** `dist`

В дашборде Vercel включить «Include files outside the Root Directory» (для доступа к корню монорепо
и пакету моста).

## Шаги (выполняет владелец аккаунта — нужен вход в Vercel)

1. `vercel login` (или через дашборд).
2. Создать проект, указать Root Directory = `games/soz` (конфиг подхватится автоматически).
3. Первый деплой: `vercel --prod` из папки `games/soz` (или Deploy в дашборде).
4. Проверить итоговый URL в WebView (не только в десктоп-браузере) — чеклист `webview-qa`.
5. Вписать URL в `games/manifest.json` → поле `games[].url` и закоммитить.

## Проверка сборки локально (перед деплоем)

```bash
npm run bridge:build
npm run build -w @gamewingo/soz
# статически отдать dist для проверки:
npx serve games/soz/dist
```

## Замечание про вес

`dist` ≈ 1.4 МБ на диске; по сети Vercel отдаёт gzip/brotli (Phaser сжимается ~в 4 раза → ~0.4 МБ),
что укладывается в бюджет загрузки < 3 сек на 3G. Проверить реальным throttling в DevTools/на устройстве.
