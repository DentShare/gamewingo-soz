# @gamewingo/game-bridge

Единый мост между HTML5-игрой в WebView и финтех-приложением. Один пакет на весь каталог игр.

## Принципы

- Игра **не начисляет баллы сама** — только отправляет факт результата. Начисление, валидация и антифрод живут на сервере (FastAPI + Supabase).
- Один контракт событий (`events.ts`) — публичный, меняется согласованно с iOS/Android.
- Транспорт выбирается автоматически: iOS WKWebView → Android WebView → web-фолбэк (`postMessage`).

## Файлы

- `events.ts` — типы событий `GameToAppEvent` / `AppToGameEvent`, `BrandTheme`, версия протокола.
- `bridge.ts` — `createBridge()`: отправка событий приложению и подписка на входящие.
- `api.ts` — `createApiClient()`: `submitScore()` и `leaderboard()`.

## Подключение в игре

```ts
import { createBridge, createApiClient } from '@gamewingo/game-bridge';

const bridge = createBridge();
bridge.onApp((e) => {
  if (e.type === 'INIT') {
    const api = createApiClient({ baseUrl: e.apiBaseUrl, authToken: e.authToken });
    // ... сохранить api и sessionId, применить e.theme
  }
});
bridge.ready();
```

Полный поток событий и требования к серверу — в `docs/ARCHITECTURE.md`.
