import { C,S,FADE,FONT as UI_FONT } from '@gamewingo/game-ui';
import type { ShapeType } from '../core/blockDrop';
export const FONT=UI_FONT;
export const COLORS={bg:C.bg,headText:S.ink,headMuted:S.muted,panel:C.surface,panelBorder:C.divider,slot:C.slot,primary:C.primary,accent:C.accent,success:C.success,danger:C.danger,gold:C.gold,fade:FADE};
export const BLOCK_COLORS:Record<ShapeType,number>={I:C.accent,O:C.gold,T:C.primary,L:C.primarySoft,J:C.accentDark,S:C.success,Z:C.danger};
