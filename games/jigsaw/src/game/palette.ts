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
  fade: FADE,

  // ── Специфика пазла ────────────────────────────────────────────────────────
  /** Поле сборки: пустая клетка и её сетка. */
  slot: C.slot,
  slotLine: C.divider,
  /** Подсветка клетки, над которой висит кусочек. */
  slotHover: C.tint,
  /** Лоток с кусочками внизу экрана. */
  trayBg: C.surface,
  trayBorder: C.divider,
  /** Вспышка при верной и неверной постановке. */
  ok: C.success,
  miss: C.danger,
  /** Карточка истории после сборки. */
  storyBg: C.surface,
  storyInk: S.ink,
  storyTitle: S.primary,
};
