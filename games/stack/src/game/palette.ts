import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';

/** Шрифт каталога — системный шрифт платформы (см. docs/DESIGN.md). */
export const FONT = UI_FONT;

/** Централизованная палитра (светлая тема WinGo — общая для каталога). */
export const COLORS = {
  bg: C.bg,
  headText: S.ink,
  headMuted: S.muted,
  panel: C.surface,
  panelBorder: C.divider,
  primary: C.primary,
  iconDark: C.ink,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Собственное для «Башни» ────────────────────────────────────────────────
  /** Тень под башней/лёгкая подложка поля. */
  shade: C.tint,
  /** Вспышка идеального попадания. */
  perfect: C.accent,
  /** Крупный счёт во время партии. */
  scoreText: S.ink,
  /** Отрезанный кусок — чуть бледнее блока (альфа задаётся в сцене). */
  cutAlpha: 0.85,
};

/**
 * Цвета блоков башни: чередование двух акцентов каталога с оттенками —
 * башня остаётся разноцветной, но не выходит из палитры (docs/DESIGN.md).
 */
const BLOCK_CYCLE = [
  C.primary,
  C.accent,
  C.primarySoft,
  C.accentSoft,
  0xe0531a,
  C.accentDark,
];

export function blockColor(index: number): number {
  return BLOCK_CYCLE[index % BLOCK_CYCLE.length];
}
