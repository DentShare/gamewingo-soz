import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';

/** Шрифт каталога — системный шрифт платформы (см. docs/DESIGN.md). */
export const FONT = UI_FONT;

/**
 * Централизованная палитра (светлая тема WinGo — общая для каталога).
 * Ключи `bg…toastText` используются `ui.ts` и совпадают с остальными играми каталога;
 * `target*` — специфика «Меткого глаза».
 */
export const COLORS = {
  bg: C.bg,
  headText: S.ink,
  headMuted: S.muted,
  panel: C.surface,
  panelBorder: C.divider,
  primary: C.primary,
  iconDark: C.ink,
  cardBack: C.primary,
  cardBackMark: '#ffebe2',
  matchGlow: C.accent,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Специфика «Меткого глаза» ───────────────────────────────────────────────
  field: C.slot,           // игровое поле
  fieldBorder: C.divider,
  targetRing: C.primary,   // внешнее кольцо цели
  targetMid: C.surface,    // среднее кольцо
  targetCore: C.primary,   // «яблочко»
  goldenRing: C.gold,      // золотая цель
  goldenMid: C.goldSoft,
  goldenCore: C.gold,
  ripple: C.muted,         // волна на месте промаха
  popText: S.accent,       // «+N» за обычную цель
  popGolden: S.gold,       // «+N» за золотую
  comboText: S.primary,    // серия в HUD
  timeLow: S.danger,       // таймер на последних секундах
};
