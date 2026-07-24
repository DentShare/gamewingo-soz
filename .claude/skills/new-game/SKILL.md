---
name: new-game
description: >-
  Создать новую игру каталога из официального стартера Phaser (template-vite-ts),
  подключить общий финтех-мост @gamewingo/game-bridge и положить SPEC.md. Использовать,
  когда пользователь просит «добавь игру», «новая игра», «заскаффолди <механику>»,
  «начни игру <slug>».
---

# Скилл: new-game

Создаёт папку `games/<slug>/` с рабочим Vite-проектом Phaser, подключённым к финтех-мосту.

## Когда использовать

Пользователь хочет начать новую игру каталога (с нуля из стартера или на базе форкнутого шаблона).

## Шаги

1. **Уточнить входные данные** (если не заданы): `slug` (латиница, kebab-case), механика, источник-шаблон.
   Если игра делается из стороннего шаблона — сначала прогнать скилл `license-check`.

2. **Создать проект из стартера:**
   ```bash
   cp -r template-vite-ts-main games/<slug>
   rm -rf games/<slug>/.git games/<slug>/node_modules games/<slug>/package-lock.json
   cp docs/SPEC.template.md games/<slug>/SPEC.md
   ```

3. **Настроить `games/<slug>/package.json`:**
   - `"name": "@gamewingo/<slug>"`, `"private": true`;
   - добавить зависимость `"@gamewingo/game-bridge": "*"` (workspace);
   - оставить скрипты `dev` / `build` из стартера.

4. **Подключить мост** в `src/game/scenes/Boot.ts` (или Preloader): создать `createBridge()`,
   подписаться на `INIT`, вызвать `bridge.ready()`. Детали — скилл `fintech-bridge`.

5. **Заполнить `games/<slug>/SPEC.md`** по ответам пользователя (механика, бренд, события моста).

6. **Установить и проверить запуск:**
   ```bash
   npm install
   npm run dev -w @gamewingo/<slug>
   ```

7. **Записать источник и лицензию** в `docs/LICENSES.md` (если ещё не сделано скиллом `license-check`).

## Definition of done

- Папка `games/<slug>` собирается (`npm run build -w @gamewingo/<slug>` проходит).
- Мост подключён, `GAME_READY` отправляется при загрузке.
- `SPEC.md` заполнен, строка в реестре лицензий есть.

## Не делать

- Не тащить второй движок — только Phaser.
- Не хардкодить тексты — через словарь локализации (RU/UZ).
- Не начислять баллы на клиенте.
