import { C, S, FADE, FONT as UI_FONT } from '@gamewingo/game-ui';
import type { LiquidColor } from '../core/colorSort';

export const FONT = UI_FONT;
export const COLORS = {
  bg: C.bg, headText: S.ink, headMuted: S.muted, panel: C.surface,
  panelBorder: C.divider, slot: C.slot, primary: C.primary,
  accent: C.accent, success: C.success, danger: C.danger, fade: FADE,
};

/** Игровая палитра построена только из общих токенов WinGo. */
export const LIQUID_COLORS: Record<LiquidColor, number> = {
  orange: C.primary, teal: C.accent, gold: C.gold,
  coral: C.primarySoft, violet: C.danger, green: C.success,
};
