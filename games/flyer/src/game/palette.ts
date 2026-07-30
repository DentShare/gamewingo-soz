import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';

/** Шрифт каталога — системный шрифт платформы (см. docs/DESIGN.md). */
export const FONT = UI_FONT;

/**
 * Палитра: база — общая светлая тема WinGo (как у остальных игр каталога),
 * плюс «небесные» цвета игрового поля (небо/земля/стены/герой).
 * Ключи bg, headText, headMuted, panel, panelBorder, primary, iconDark,
 * toastBg, toastText, fade — контракт для `ui.ts`, не переименовывать.
 */
export const COLORS = {
  bg: C.bg,
  headText: S.ink,
  headMuted: S.muted,
  panel: C.surface,
  panelBorder: C.divider,
  primary: C.primary,
  iconDark: C.ink,

  // ── Игровое поле ───────────────────────────────────────────────────────────
  skyTop: 0xbfe0da,        // верх градиента неба (мягкая бирюза)
  skyBottom: 0xf2fafa,     // низ градиента неба
  cloud: 0xffffff,
  ground: C.tint,          // полоса земли
  groundDark: 0xf0cdb6,
  // Препятствия — брендовые оранжевые «маяки»: свой силуэт и палитра каталога,
  // никакого сходства с оформлением известных tap-игр (зелёные трубы с пояском).
  wall: C.primary,
  wallDark: 0xd0511a,
  wallLight: C.primarySoft,
  wallGlow: C.tint,        // светлая вставка у торца проёма
  hero: C.accent,          // герой — бирюзовый, контраст к оранжевым стенам
  heroDark: C.accentDark,
  scoreText: '#ffffff',    // крупный счёт поверх неба
  scoreShadow: '#2f4f4a',

  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,
};
