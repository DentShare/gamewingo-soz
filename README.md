# GameWingo

Монорепо каталога встраиваемых HTML5-игр для финтех-приложения. Стек: **Phaser 4 + TypeScript + Vite**,
хостинг Vercel, бэкенд FastAPI + Supabase, связь с приложением через WebView-мост.

## Быстрый старт

```bash
npm install
npm run bridge:build
# создать первую игру: используйте скилл new-game в Claude Code, либо вручную
cp -r template-vite-ts-main games/hello && cp docs/SPEC.template.md games/hello/SPEC.md
```

## Навигация

- `CLAUDE.md` — контекст и правила для Claude Code (главный вход).
- `packages/game-bridge/` — общий финтех-мост `@gamewingo/game-bridge`.
- `games/` — отдельные игры (по папке на игру).
- `docs/` — `SPEC.template.md`, `LICENSES.md`, `ARCHITECTURE.md`.
- `.claude/skills/` — скиллы: `new-game`, `license-check`, `fintech-bridge`, `webview-qa`.
- Референс-репозитории в корне (`examples-master`, `howler.js-master`, …) — примеры, не часть сборки.

## Правила в двух словах

Игра не начисляет баллы (это делает сервер) · никаких реальных денег (App Store 4.7) · лицензии MIT/CC0/CC-BY/CodeCanyon, ничего под GPL/NC · билд < 2–5 МБ · mobile-first, тест в WebView.

Полная внутренняя инструкция — `Инструкция — стек и источники шаблонов для HTML5-игр.md`.
