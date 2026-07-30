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
  /** Обратный отсчёт на исходе и сообщение о проваленном уровне. */
  danger: S.danger,
  toastBg: S.ink,
  toastText: S.white,
  /** Фон камеры для fade (RGB, совпадает с bg). */
  fade: FADE,

  // ── Судоку-специфика ──────────────────────────────────────────────────────
  givenText: S.ink,        // данные (givens)
  givenBg: C.slot,         // фон клетки с given
  inputText: S.primary,    // ввод игрока
  conflictText: S.danger,  // конфликт (текст)
  conflictBg: C.dangerBg,  // подсветка конфликтной клетки
  selectedBg: C.tint,      // выделенная клетка
  lineHintBg: C.slotSoft,  // подсветка строки/столбца
  gridLine: C.divider,     // тонкие линии между клетками
  blockLine: C.muted,      // границы блоков
  keyDefault: C.surface,   // клавиша цифровой панели
  keyText: S.ink,          // текст на клавише
};
