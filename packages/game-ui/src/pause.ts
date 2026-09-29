import type { Scene } from 'phaser';
import { C, S, FONT, TYPE, WEIGHT, TOP_BAR_H } from './tokens.js';
import { DPR, LOGICAL_W, VIEW_TOP, VIEW_BOTTOM } from './viewport.js';
import { hideSplash, makeButton, makeChip, makeSoundToggle } from './widgets.js';
import { playSound } from './audio.js';
import { uiText } from './strings.js';

/**
 * Партия в WebView (T3 UX-волны, раздел 1i аудита): одна шапка на весь каталог,
 * пауза вместо потери партии и системный «назад», который ведёт туда же, куда стрелка.
 *
 * Раньше в партии была белая пилюля «Назад» и текстовый HUD, а тап по ней на
 * одиннадцатом ходу уровня с лимитом сразу выкидывал в меню — партия терялась
 * без вопроса. Теперь стрелка открывает паузу: продолжить / заново / выйти
 * с честным предупреждением. Там же живут звук и «Как играть».
 */

export interface HeaderChip {
  id: string;
  text: string;
  /**
   * Самый длинный текст, который чип может показать («20 / 20», «10:00»).
   * По нему считается ширина: чипы стоят вплотную, и растущий текст не должен
   * наезжать на соседа.
   */
  widest?: string;
}

export interface GameHeader {
  root: Phaser.GameObjects.Container;
  /** Обновить чип; `warn` — последние секунды таймера: белая плашка, красный текст. */
  setChip(id: string, text: string, warn?: boolean): void;
  setTitle(s: string): void;
  /** Прямоугольник чипа в мировых координатах — для подсветки в обучении. */
  chipRect(id: string): { x: number; y: number; w: number; h: number } | null;
  destroy(): void;
}

/**
 * Шапка партии: градиент каталога, стрелка слева (тап-зона 44), заголовок
 * «Уровень N» и справа чипы метрик — ходы «11 / 20», таймер «0:09».
 * Метрики чипами, а не текстом: их видно боковым зрением, не отрываясь от поля.
 */
export function makeGameHeader(
  scene: Scene,
  opts: { title: string; chips?: HeaderChip[]; onBack(): void },
): GameHeader {
  hideSplash();
  const root = scene.add.container(0, 0).setDepth(40);
  const cy = TOP_BAR_H / 2;

  const bar = scene.add.graphics();
  bar
    .fillGradientStyle(C.topBarLeft, C.topBarRight, C.topBarLeft, C.topBarRight, 1)
    .fillRect(0, VIEW_TOP, LOGICAL_W, TOP_BAR_H - VIEW_TOP);

  const chevron = scene.add.graphics();
  chevron.lineStyle(2, C.white, 1).beginPath();
  chevron.moveTo(41, cy - 8);
  chevron.lineTo(33, cy);
  chevron.lineTo(41, cy + 8);
  chevron.strokePath();
  const hit = scene.add.rectangle(36, cy, 48, 48, 0x000000, 0).setInteractive({ useHandCursor: true });
  hit.on('pointerdown', () => playSound('tap'));
  hit.on('pointerup', () => opts.onBack());

  // Чипы справа налево; заголовок центрируется в том, что осталось между стрелкой и чипами.
  const chips = new Map<string, { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text }>();
  let right = LOGICAL_W - 14;
  const chipObjs: Phaser.GameObjects.GameObject[] = [];
  const chipW = new Map<string, number>();
  const chipMin = new Map<Phaser.GameObjects.Text, number>();
  const paintChip = (g: Phaser.GameObjects.Graphics, t: Phaser.GameObjects.Text, x: number, warn: boolean) => {
    const w = Math.max(44, chipMin.get(t) ?? 0, t.width + 16);
    g.clear();
    g.fillStyle(C.white, warn ? 1 : 0.22).fillRoundedRect(x - w, cy - 13, w, 26, 13);
    t.setPosition(x - w / 2, cy);
    t.setColor(warn ? S.danger : S.white);
    return w;
  };
  const chipRight = new Map<string, number>();
  for (const c of [...(opts.chips ?? [])].reverse()) {
    const g = scene.add.graphics();
    const t = scene.add
      .text(0, 0, c.widest ?? c.text, { fontFamily: FONT, fontSize: 13, fontStyle: WEIGHT.bold, color: S.white })
      .setOrigin(0.5)
      .setResolution(DPR);
    chipMin.set(t, t.width + 16);
    t.setText(c.text);
    const w = paintChip(g, t, right, false);
    chipW.set(c.id, w);
    chips.set(c.id, { g, t });
    chipRight.set(c.id, right);
    chipObjs.push(g, t);
    right -= w + 6;
  }

  const titleLeft = 56;
  const titleRight = right;
  const heading = scene.add
    .text((titleLeft + titleRight) / 2, cy, opts.title, {
      fontFamily: FONT, fontSize: TYPE.title, fontStyle: WEIGHT.semibold, color: S.white,
    })
    .setOrigin(0.5)
    .setResolution(DPR);

  root.add([bar, chevron, heading, ...chipObjs, hit]);
  return {
    root,
    setChip: (id, text, warn = false) => {
      const c = chips.get(id);
      if (!c) return;
      c.t.setText(text);
      chipW.set(id, paintChip(c.g, c.t, chipRight.get(id) ?? LOGICAL_W - 14, warn));
    },
    chipRect: (id) => {
      const r = chipRight.get(id);
      const w = chipW.get(id);
      if (r === undefined || w === undefined) return null;
      return { x: r - w, y: cy - 13, w, h: 26 };
    },
    setTitle: (s) => heading.setText(s),
    destroy: () => root.destroy(),
  };
}

export interface PauseSheetOpts {
  locale: string;
  /** Строка состояния: «Таймер остановлен · 11 ходов из 20 · осталось 0:09». */
  summary?: string;
  /** Подписи звука — из словаря игры, как у переключателя в меню. */
  sound: { on: string; off: string };
  onResume(): void;
  onRestart(): void;
  onExit(): void;
  /** «Как играть» — если у игры есть обучение. */
  onHowto?(): void;
  /** Уровень лестницы или забег аркады — от этого зависят подписи «заново» и «выйти». */
  kind?: 'level' | 'run';
}

export interface PauseSheet {
  close(): void;
  readonly open: boolean;
}

/**
 * Пауза-шит снизу: затемнение, «Пауза», строка состояния и три действия —
 * продолжить, начать заново, выйти (красным, с предупреждением, что прогресс
 * уровня пропадёт). Затемнение глотает тапы — поле под шитом не нажимается.
 * Таймер останавливает вызывающая сцена до открытия и запускает в `onResume`.
 */
export function openPauseSheet(scene: Scene, o: PauseSheetOpts): PauseSheet {
  const root = scene.add.container(0, 0).setDepth(1000);
  let isOpen = true;

  const dim = scene.add
    .rectangle(LOGICAL_W / 2, (VIEW_TOP + VIEW_BOTTOM) / 2, LOGICAL_W, VIEW_BOTTOM - VIEW_TOP, C.ink, 0.5)
    .setInteractive();
  // Тап мимо шита — то же, что «Продолжить»: самый безопасный из вариантов.
  dim.on('pointerup', () => resume());

  const W = LOGICAL_W;
  const pad = 20;
  const summaryH = o.summary ? 22 : 0;
  const H = 20 + 26 + summaryH + 20 + 48 + 12 + 44 + 12 + 44 + 18 + 26 + 24;
  const top = VIEW_BOTTOM - H;

  const sheet = scene.add.graphics();
  sheet.fillStyle(C.bg, 1).fillRoundedRect(0, top, W, H + 20, { tl: 20, tr: 20, bl: 0, br: 0 });
  sheet.fillStyle(C.divider, 1).fillRoundedRect(W / 2 - 18, top + 8, 36, 4, 2);
  // Шит тоже ловит тапы, иначе они провалятся в затемнение и закроют его.
  const sheetHit = scene.add.rectangle(W / 2, top + H / 2, W, H, 0x000000, 0).setInteractive();

  let y = top + 20;
  const title = scene.add
    .text(W / 2, y + 13, uiText(o.locale, 'pause.title'), {
      fontFamily: FONT, fontSize: TYPE.title, fontStyle: WEIGHT.bold, color: S.ink,
    })
    .setOrigin(0.5)
    .setResolution(DPR);
  y += 26;
  const items: Phaser.GameObjects.GameObject[] = [dim, sheet, sheetHit, title];
  if (o.summary) {
    items.push(
      scene.add
        .text(W / 2, y + 11, o.summary, { fontFamily: FONT, fontSize: 13, color: S.muted })
        .setOrigin(0.5)
        .setResolution(DPR),
    );
    y += summaryH;
  }
  y += 20;
  const bw = W - pad * 2;
  const resumeBtn = makeButton(scene, W / 2, y + 24, uiText(o.locale, 'pause.resume'), () => resume(), {
    primary: true, width: bw, height: 48,
  });
  y += 48 + 12;
  const restartBtn = makeButton(scene, W / 2, y + 22, uiText(o.locale, o.kind === 'run' ? 'pause.restartRun' : 'pause.restart'), () => act(o.onRestart), {
    width: bw, height: 44,
  });
  y += 44 + 12;
  const exitBtn = makeButton(scene, W / 2, y + 22, uiText(o.locale, o.kind === 'run' ? 'pause.exitRun' : 'pause.exit'), () => act(o.onExit), {
    width: bw, height: 44, danger: true,
  });
  y += 44 + 18;
  items.push(resumeBtn.root, restartBtn.root, exitBtn.root);

  // Ряд чипов: звук и «Как играть» — переехали сюда из меню игры.
  const sound = makeSoundToggle(scene, 0, y + 13, o.sound, 112);
  const row: Phaser.GameObjects.Container[] = [sound.root];
  let howto: ReturnType<typeof makeChip> | null = null;
  if (o.onHowto) {
    howto = makeChip(scene, 0, y + 13, uiText(o.locale, 'pause.howto'), 112);
    const hh = scene.add.rectangle(0, 0, 112, 38, 0x000000, 0).setInteractive({ useHandCursor: true });
    hh.on('pointerup', () => act(() => o.onHowto?.()));
    howto.root.add(hh);
    row.push(howto.root);
  }
  const gap = 8;
  const rowW = row.length * 112 + (row.length - 1) * gap;
  row.forEach((r, i) => r.setX(W / 2 - rowW / 2 + 56 + i * (112 + gap)));
  items.push(...row);

  // Всё, кроме затемнения, — в одной панели: она выезжает снизу целиком.
  const panel = scene.add.container(0, H, items.filter((g) => g !== dim));
  root.add([dim, panel]);
  dim.setAlpha(0);
  scene.tweens.add({ targets: dim, alpha: 1, duration: 160 });
  scene.tweens.add({ targets: panel, y: 0, duration: 220, ease: 'Cubic.easeOut' });

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.destroy();
  }
  function resume() {
    if (!isOpen) return;
    close();
    o.onResume();
  }
  function act(fn: () => void) {
    close();
    fn();
  }
  scene.events.once('shutdown', close);

  return { close, get open() { return isOpen; } };
}

// ── Системный «назад» ─────────────────────────────────────────────────────────

let backHandler: (() => void) | null = null;
let installed = false;

/**
 * Системный «назад» (Android-кнопка, жест iOS, «назад» браузера) ведёт туда же,
 * куда стрелка в шапке: партия → пауза, пауза → меню, меню → выход в каталог.
 * Без этого WebView закрывался целиком посреди партии.
 *
 * Механика: при первом вызове кладём в историю «пустой» шаг; на `popstate`
 * зовём обработчик текущего экрана и кладём шаг заново — следующий «назад»
 * снова придёт к нам. Каждая сцена в `create()` ставит свой обработчик;
 * `null` — отдать «назад» браузеру (например, перед уходом на хаб).
 */
export function setBackHandler(handler: (() => void) | null): void {
  backHandler = handler;
  if (typeof window === 'undefined') return;
  if (!installed && handler) {
    installed = true;
    try {
      window.history.pushState({ wingo: 'game' }, '');
      window.addEventListener('popstate', () => {
        const h = backHandler;
        if (!h) return;
        window.history.pushState({ wingo: 'game' }, '');
        h();
      });
    } catch {
      /* без истории (встраивание в iframe с ограничениями) — остаётся только стрелка */
    }
  }
}
