/**
 * Звук каталога: восемь эффектов из общего пака Kenney (CC0) с синтезом-фолбэком.
 *
 * Почему так, а не через звуковой менеджер Phaser: слой нужен и вне сцен (мост,
 * переключатель в меню, тесты), а Phaser-менеджер живёт внутри игры и не умеет
 * переживать перезапуск сцены. Здесь чистый WebAudio и никаких зависимостей.
 *
 * Три вещи, ради которых слой существует:
 *  - iOS WKWebView не даёт звук до жеста пользователя — `installAudioUnlock()`;
 *  - беззвучный режим общий для каталога — ключ `wingo:sound` в localStorage;
 *  - файл может не догрузиться (3G, офлайн) — тогда играет синтез, а не тишина.
 *
 * Пак зашит в бандл (`audioData.ts`, генерируется `scripts/build-audio.mjs`):
 * отдельный запрос за звуком внутри WebView — лишний класс молчаливых отказов
 * (нет сети, чужой базовый путь, строгий CSP). Формат — mp3: единственный, что
 * декодируют и WKWebView на iOS, и Android WebView, и любая сборка Chromium
 * (в AAC открытые сборки упираются в EncodingError).
 * Реестр лицензий: строка «Звуки интерфейса» в `docs/LICENSES.md`.
 */

import { AUDIO_DATA } from './audioData.js';

/** Восемь событий, которых хватает любой игре каталога. */
export type SoundName =
  | 'tap'    // нажатие кнопки
  | 'ok'     // верный ход
  | 'wrong'  // ошибка
  | 'win'    // уровень пройден
  | 'lose'   // партия проиграна
  | 'coin'   // начислен бонус
  | 'star'   // получена звезда
  | 'swipe'; // сдвиг, свайп

export const SOUND_NAMES: readonly SoundName[] = [
  'tap', 'ok', 'wrong', 'win', 'lose', 'coin', 'star', 'swipe',
];

/** Один тон синтеза: волна, частота (при `to` — глиссандо), длительность, место в звуке. */
interface Tone {
  wave: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  gain?: number;
  delay?: number;
}

/**
 * Партитуры фолбэка. Не «замена файлам», а страховка: если пак не догрузился,
 * игрок слышит хоть что-то осмысленное вместо тишины.
 */
const SYNTH: Record<SoundName, readonly Tone[]> = {
  tap: [{ wave: 'triangle', from: 660, to: 520, dur: 0.06, gain: 0.5 }],
  ok: [
    { wave: 'sine', from: 740, to: 880, dur: 0.09 },
    { wave: 'sine', from: 990, to: 1180, dur: 0.12, delay: 0.07 },
  ],
  wrong: [
    { wave: 'sawtooth', from: 300, to: 150, dur: 0.20, gain: 0.3 },
    { wave: 'square', from: 150, dur: 0.08, gain: 0.15, delay: 0.16 },
  ],
  win: [
    { wave: 'sine', from: 523, dur: 0.12 },
    { wave: 'sine', from: 659, dur: 0.12, delay: 0.11 },
    { wave: 'sine', from: 784, dur: 0.12, delay: 0.22 },
    { wave: 'sine', from: 1046, dur: 0.26, delay: 0.33 },
  ],
  lose: [
    { wave: 'triangle', from: 392, to: 262, dur: 0.18, gain: 0.4 },
    { wave: 'triangle', from: 262, to: 160, dur: 0.30, gain: 0.35, delay: 0.16 },
  ],
  coin: [
    { wave: 'square', from: 988, dur: 0.05, gain: 0.25 },
    { wave: 'square', from: 1319, dur: 0.13, gain: 0.25, delay: 0.05 },
  ],
  star: [
    { wave: 'triangle', from: 880, to: 1320, dur: 0.10, gain: 0.35 },
    { wave: 'sine', from: 1760, dur: 0.16, gain: 0.2, delay: 0.09 },
  ],
  swipe: [{ wave: 'sine', from: 420, to: 700, dur: 0.08, gain: 0.22 }],
};

/** Общий для каталога ключ: выключил звук в одной игре — тихо во всех. */
const MUTE_KEY = 'wingo:sound';

/** Мастер-громкость: слышно в тишине и не бьёт по ушам в наушниках. */
const MASTER_GAIN = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
let loading = false;
const buffers = new Map<SoundName, AudioBuffer>();

/** Конструктор AudioContext или null (тесты, SSR, старые движки). */
function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'off';
  } catch {
    return false;
  }
}

/** Выключен ли звук. */
export function isMuted(): boolean {
  return muted;
}

/** Включить или выключить звук; состояние переживает перезапуск игры и общее для каталога. */
export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? 'off' : 'on');
  } catch {
    // Приватный режим WebView — переживём без сохранения.
  }
  if (master) master.gain.value = value ? 0 : MASTER_GAIN;
  if (!value) void loadPack();
}

/**
 * Декодировать буфер. Safari до 14.1 не умеет промис-форму `decodeAudioData`
 * и возвращает undefined — поэтому зовём колбэчную и промис-форму разом.
 */
function decode(raw: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const maybe = ctx!.decodeAudioData(raw, resolve, reject) as unknown as
      Promise<AudioBuffer> | undefined;
    if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject);
  });
}

/** base64 → байты. Сети здесь нет: пак уже в бандле. */
function bytes(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Расшифровать пак. Тихо выходит при любой ошибке — фолбэком останется синтез. */
async function loadPack(): Promise<void> {
  if (!ctx || loading || buffers.size === SOUND_NAMES.length) return;
  if (typeof atob !== 'function') return;
  loading = true;
  await Promise.all(
    SOUND_NAMES.map(async (name) => {
      if (buffers.has(name)) return;
      const data = AUDIO_DATA[name];
      if (!data) return;
      try {
        buffers.set(name, await decode(bytes(data)));
      } catch {
        // Формат не по зубам движку — останется синтез.
      }
    }),
  );
  loading = false;
}

/**
 * Создать (или разбудить) аудиоконтекст. Вызывать **только из обработчика жеста**.
 *
 * На iOS одного `resume()` мало: контекст просыпается, только если внутри жеста
 * реально что-то прозвучало. Поэтому играем один беззвучный сэмпл — приём
 * старый, но без него Safari молчит и ни о чём не сообщает.
 */
export function unlockAudio(): void {
  const Ctor = audioCtor();
  if (!Ctor) return;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') void ctx.resume();
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22_050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // Совсем древний движок — дальше просто ничего не прозвучит.
  }
  if (!muted) void loadPack();
}

/**
 * Повесить разблокировку на жесты пользователя. Вызывать один раз в `main.ts`.
 *
 * Две вещи, без которых это не работает на iOS:
 *  - слушатели снимаются не после первого касания, а когда контекст
 *    действительно заиграл: первая попытка часто оставляет его в `suspended`;
 *  - контекст сам уходит в `interrupted` после звонка или сворачивания —
 *    поэтому будим его ещё и при возврате на вкладку.
 */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  const events = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'];

  const onGesture = () => {
    unlockAudio();
    if (ctx && ctx.state === 'running') {
      for (const type of events) window.removeEventListener(type, onGesture, true);
    }
  };
  // Фаза перехвата: жест доходит до нас раньше любого обработчика на канве.
  for (const type of events) window.addEventListener(type, onGesture, true);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume();
    });
  }
}

/** Состояние звука — для страницы диагностики и отчётов об ошибках. */
export function audioDiagnostics(): {
  supported: boolean; state: string; loaded: number; total: number; muted: boolean;
} {
  return {
    supported: audioCtor() !== null,
    state: ctx ? ctx.state : 'нет контекста',
    loaded: buffers.size,
    total: SOUND_NAMES.length,
    muted,
  };
}

/** Проиграть готовый буфер из пака. */
function playBuffer(buffer: AudioBuffer): void {
  const src = ctx!.createBufferSource();
  src.buffer = buffer;
  src.connect(master!);
  src.start();
  src.onended = () => src.disconnect();
}

/** Сыграть один тон синтеза. */
function playTone(tone: Tone, at: number): void {
  const osc = ctx!.createOscillator();
  const gain = ctx!.createGain();
  const start = at + (tone.delay ?? 0);
  const end = start + tone.dur;
  const peak = tone.gain ?? 0.4;

  osc.type = tone.wave;
  osc.frequency.setValueAtTime(tone.from, start);
  if (tone.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.to), end);

  // Мгновенная атака и экспоненциальный спад: без спада WebAudio щёлкает на обрыве.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(master!);
  osc.start(start);
  osc.stop(end + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/**
 * Сыграть эффект. Безопасно вызывать до разблокировки и в тестах — тогда это no-op.
 * Пока пак не догружен, звучит синтез: тишина хуже приблизительного звука.
 */
export function playSound(name: SoundName): void {
  if (muted) return;
  if (!ctx) unlockAudio();
  if (!ctx || !master) return;
  if (ctx.state !== 'running') {
    // Контекст задремал (iOS делает это после звонка или сворачивания).
    // Будим и пропускаем этот звук: следующий уже прозвучит.
    void ctx.resume();
    return;
  }
  const buffer = buffers.get(name);
  if (buffer) {
    playBuffer(buffer);
    return;
  }
  const at = ctx.currentTime;
  for (const tone of SYNTH[name]) playTone(tone, at);
}

/** Закрыть контекст — при выгрузке игры или в `bridge.destroy()`. */
export function stopAudio(): void {
  if (!ctx) return;
  void ctx.close();
  ctx = null;
  master = null;
  buffers.clear();
}
