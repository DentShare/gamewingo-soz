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
 * Файлы кладёт `scripts/sync-audio.mjs` в `games/<slug>/public/audio/`. Формат — mp3:
 * единственный, который декодируют и WKWebView на iOS, и Android WebView, и любая
 * сборка Chromium (в AAC открытые сборки Chromium упираются в EncodingError).
 * Реестр лицензий: строка «Звуки интерфейса» в `docs/LICENSES.md`.
 */

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

/** Где лежат файлы относительно корня игры. Меняется через `configureAudio`. */
let basePath = 'audio/';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
let loading = false;
const buffers = new Map<SoundName, AudioBuffer>();

/** Куда смотреть за файлами. Вызывать до `installAudioUnlock`, если путь нестандартный. */
export function configureAudio(opts: { basePath?: string }): void {
  if (opts.basePath !== undefined) basePath = opts.basePath;
}

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

/** Догрузить пак. Тихо выходит при любой ошибке — фолбэком останется синтез. */
async function loadPack(): Promise<void> {
  if (!ctx || loading || buffers.size === SOUND_NAMES.length) return;
  if (typeof fetch !== 'function') return;
  loading = true;
  await Promise.all(
    SOUND_NAMES.map(async (name) => {
      if (buffers.has(name)) return;
      try {
        const res = await fetch(`${basePath}${name}.mp3`);
        if (!res.ok) return;
        const raw = await res.arrayBuffer();
        const decoded = await ctx!.decodeAudioData(raw);
        buffers.set(name, decoded);
      } catch {
        // Нет файла или формат не по зубам движку — останется синтез.
      }
    }),
  );
  loading = false;
}

/**
 * Создать (или разбудить) аудиоконтекст. Вызывать **только из обработчика жеста**:
 * iOS оставляет контекст в состоянии `suspended`, если тронуть его раньше.
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
  if (ctx.state === 'suspended') void ctx.resume();
  if (!muted) void loadPack();
}

/**
 * Повесить разблокировку на первый жест. Вызывать один раз в `main.ts` игры.
 * Слушатели на документе, поэтому канва Phaser их не перехватывает.
 */
export function installAudioUnlock(): void {
  if (typeof document === 'undefined') return;
  const once = () => {
    unlockAudio();
    document.removeEventListener('pointerdown', once);
    document.removeEventListener('touchend', once);
  };
  document.addEventListener('pointerdown', once);
  document.addEventListener('touchend', once);
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
  if (!ctx || !master || ctx.state !== 'running') return;
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
