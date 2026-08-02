/**
 * Токены дизайн-системы каталога. Значения — из макета WinGo, полная таблица
 * и правила использования в `docs/DESIGN.md`. Хекс-значения меняются только здесь.
 */

/** Системный шрифт платформы: на iOS — SF Pro (как в макете), на Android — Roboto. */
export const FONT = "system-ui, -apple-system, 'SF Pro Text', Roboto, sans-serif";

/** Цвета как числа Phaser (0xRRGGBB). */
export const C = {
  primary: 0xf76624,
  primaryPressed: 0xdc5314,
  accent: 0x4e9b90,
  ink: 0x1a1a1a,
  muted: 0x8e97a7,
  bg: 0xf9f9f9,
  surface: 0xffffff,
  tint: 0xffebe2,
  chipBg: 0xffddbf,
  chipInk: 0xfa7700,
  divider: 0xd9d9d9,
  white: 0xffffff,
  /** Градиент шапки: слева → справа (в CSS это `270deg`, т.е. справа налево). */
  topBarLeft: 0xff5001,
  topBarMid: 0xfd7b03,
  topBarRight: 0xff7700,

  // ── Расширение палитры для игровых полей ───────────────────────────────────
  /** Пустой слот/вдавленная ячейка на белой карточке. */
  slot: 0xf1f2f4,
  /** Ещё более мягкая подсветка ячейки (подсказка строки/столбца). */
  slotSoft: 0xf7f8fa,
  /** Светлый оттенок основного цвета (градиенты, вторая фаза анимаций). */
  primarySoft: 0xff9a5e,
  /** Тёмный и светлый оттенки акцента. */
  accentDark: 0x3d7f77,
  accentSoft: 0x6bb3a9,
  /**
   * Чистый зелёный «верно». Отдельно от бирюзового `accent`: там, где зелёный
   * противопоставлен оранжевому (плитки «5 букв»), бирюза читается как сине-зелёная
   * и смазывает разницу между «угадано» и «не на месте».
   */
  success: 0x3aa657,
  /** Ошибка/конфликт: заливка и мягкая подсветка. */
  danger: 0xe0533f,
  dangerBg: 0xfbe0da,
  /** Бонус/золото — третий акцент, только для наград. */
  gold: 0xd99a12,
  goldSoft: 0xfff3cf,
  // Без `as const`: потребители присваивают цвета в переменные, литеральные типы
  // ломали бы `let bg = a ? COLORS.x : COLORS.y`.
};

/** Те же цвета строками — для Phaser.Text, где нужен CSS-цвет. */
export const S = {
  primary: '#f76624',
  accent: '#4e9b90',
  ink: '#1a1a1a',
  muted: '#8e97a7',
  surface: '#ffffff',
  chipInk: '#fa7700',
  white: '#ffffff',
  danger: '#e0533f',
  success: '#3aa657',
  gold: '#c47f05',
};

/** Фон камеры для fadeIn/fadeOut — совпадает с `C.bg`. */
export const FADE: [number, number, number] = [0xf9, 0xf9, 0xf9];

/** Радиусы: карточки и кнопки — 12, чипы — 8. */
export const RADIUS = { card: 12, button: 12, chip: 8 } as const;

/** Отступы: поля экрана 20, поля карточки 12, шаг сетки 4/8/12/20. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 20 } as const;

/** Высота шапки внутри игры (в хабе — safe-area + 46). */
export const TOP_BAR_H = 56;

/** Размеры кнопок: md — обычная, lg — главный CTA в меню. */
export const BUTTON_H = { md: 40, lg: 48 } as const;

/** Типографическая лестница. Значения — размер шрифта в логических пикселях. */
export const TYPE = {
  display: 34,
  title: 20,
  headline: 17,
  body: 15,
  caption: 12,
} as const;

/** Начертания: 590 из макета округляется до 600 в шрифтах без переменных осей. */
export const WEIGHT = { regular: '400', semibold: '600', bold: '700' } as const;
