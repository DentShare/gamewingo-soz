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

  // ── Специфика викторины ────────────────────────────────────────────────────
  /** Вариант ответа: обычный, нажатый, верный, неверный. */
  optionFace: C.surface,
  optionPressed: C.tint,
  optionText: S.ink,
  correctFace: C.success,
  correctText: S.white,
  wrongFace: C.danger,
  wrongText: S.white,
  /** Полоса времени на вопрос. */
  timerTrack: C.divider,
  timerFill: C.primary,
  timerLow: C.danger,
  /** Карточка с фактом после ответа. */
  factBg: C.goldSoft,
  factInk: S.ink,
  factLabel: S.gold,
};
