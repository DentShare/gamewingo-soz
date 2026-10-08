---
name: fintech-bridge
description: >-
  Правильно подключить игру к финтех-приложению через @gamewingo/game-bridge: события
  GAME_READY/START/OVER/REWARD, приём INIT с токеном и темой, отправка результата на сервер.
  Использовать при интеграции новой игры с баллами/лидербордом/наградами или когда пользователь
  просит «подключи мост», «добавь начисление баллов», «сделай лидерборд», «интеграция с приложением».
---

# Скилл: fintech-bridge

Подключение игры к приложению и бэкенду. Пакет: `@gamewingo/game-bridge` (см. `packages/game-bridge`).

## Главный принцип

Игра **не начисляет баллы**. Она сообщает факт результата; начисление, валидация и антифрод — на сервере.
Клиент отправляет `score`, `durationMs`, `sessionId` и, при необходимости, метрики для антифрода.

## Минимальная интеграция (Phaser)

В `Boot`/`Preloader`:

```ts
import { createBridge, createApiClient, type ApiClient } from '@gamewingo/game-bridge';

export let api: ApiClient | null = null;
export let sessionId = '';
const bridge = createBridge();

bridge.onApp((e) => {
  if (e.type === 'INIT') {
    sessionId = e.sessionId;
    api = createApiClient({ baseUrl: e.apiBaseUrl, authToken: e.authToken });
    applyTheme(e.theme);          // палитра/лого из брендбука
    setLocale(e.locale);          // ru | uz | en
  }
  if (e.type === 'PAUSE') this.scene.pause();
  if (e.type === 'RESUME') this.scene.resume();
});

bridge.ready();                   // ← ровно один раз, когда игра загрузилась
```

При старте партии (нажали Play): `bridge.start(sessionId);`

В конце партии (`GameOver`):

```ts
const durationMs = this.time.now - startedAt;
bridge.gameOver(score, sessionId, durationMs);
// GAME_RESULT хосту + POST /progression/result; сервер решает по режиму, уровню, победе и метрикам
const res = await reportResult(bridge, api, {
  game: '<slug>', mode: 'level', level, won, score, durationMs, sessionId,
  metrics: { /* starMetric и метрики испытаний из конфига игры */ },
});
// показать res.pointsAwarded, если res.accepted
```

Награда (если есть механика забора):

```ts
bridge.claimReward(rewardId, sessionId);
// ответ придёт событием REWARD_RESULT в bridge.onApp
```

## Чеклист интеграции

- [ ] `bridge.ready()` вызывается один раз после загрузки
- [ ] `INIT` обрабатывается: сохранены `sessionId`, `api`, применены `theme` и `locale`
- [ ] `GAME_START` шлётся при старте партии (нужно для серверного лимита времени)
- [ ] `GAME_OVER` шлёт `score` и `durationMs`
- [ ] `reportResult()` идёт на сервер с `won`, `mode`, `level` и метриками конфига; UI показывает результат только после ответа
- [ ] Нет начисления баллов на клиенте
- [ ] `PAUSE`/`RESUME` корректно ставят/снимают паузу сцены
- [ ] `bridge.destroy()` при уничтожении игры (снять слушатель message)

## Антифрод (что учесть на клиенте, решает сервер)

- слать `durationMs` и метрики партии (ходы, ошибки) в `metrics`;
- не доверять локальному счёту в UI до подтверждения `reportResult`.

Схема потока событий — `docs/ARCHITECTURE.md`.
