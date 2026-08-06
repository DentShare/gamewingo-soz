import type { AppToGameEvent, GameResult, GameToAppEvent, RoundEvent } from './events.js';
import { BRIDGE_PROTOCOL_VERSION } from './events.js';

/**
 * Сырые события копятся и уходят пакетом: аркада может слать десятки событий
 * в секунду, и дёргать нативный мост на каждое — дорого для WebView.
 */
const FLUSH_DELAY_MS = 250;

/**
 * Транспорт: отправка события приложению.
 * Пытается по очереди: iOS WKWebView → Android WebView → web-фолбэк (postMessage родителю).
 */
function post(event: GameToAppEvent): void {
  const w = window as unknown as {
    webkit?: { messageHandlers?: { gameBridge?: { postMessage(e: unknown): void } } };
    AndroidBridge?: { onGameEvent(json: string): void };
  };

  if (w.webkit?.messageHandlers?.gameBridge) {
    w.webkit.messageHandlers.gameBridge.postMessage(event);
    return;
  }
  if (w.AndroidBridge) {
    w.AndroidBridge.onGameEvent(JSON.stringify(event));
    return;
  }
  // web / iframe-фолбэк (для локальной разработки и веб-версии)
  window.parent.postMessage(event, '*');
}

type Handler = (event: AppToGameEvent) => void;

/**
 * Единая точка связи игры с приложением.
 * Использование:
 *   const bridge = createBridge();
 *   bridge.onApp((e) => { if (e.type === 'INIT') { ... } });
 *   bridge.ready();
 */
export interface GameBridge {
  /** Сообщить приложению, что игра загрузилась. Вызывать один раз в Boot/Preloader. */
  ready(): void;
  /** Сообщить о старте сессии (нажали Play). */
  start(sessionId: string): void;
  /** Сообщить результат. durationMs — длительность партии для серверного антифрода. */
  gameOver(score: number, sessionId: string, durationMs: number): void;
  /** Запросить награду. Ответ придёт событием REWARD_RESULT. */
  claimReward(rewardId: string, sessionId: string): void;
  /** Произвольное аналитическое событие. */
  track(name: string, payload?: Record<string, unknown>): void;
  /**
   * Сырое игровое событие для событийного скоринга. Мост батчит их и шлёт
   * пакетом GAME_EVENTS. clientTs проставляется здесь.
   */
  sendEvent(event: Omit<RoundEvent, 'clientTs'>): void;
  /**
   * Структурированный итог партии. Перед отправкой выталкивает накопленные
   * события, чтобы результат не обогнал их. Ответ придёт PROGRESS_RESULT.
   */
  sendResult(result: GameResult): void;
  /** Вытолкнуть накопленные события немедленно (пауза, сворачивание WebView). */
  flushEvents(): void;
  /** Выйти из игры в каталог. Приложение вернёт WebView к списку игр. */
  exit(sessionId: string): void;
  /** Сообщить об ошибке. */
  error(message: string): void;
  /** Подписаться на события от приложения. Возвращает функцию отписки. */
  onApp(handler: Handler): () => void;
  /** Снять слушатель window.message (при уничтожении игры). */
  destroy(): void;
}

export function createBridge(): GameBridge {
  const handlers = new Set<Handler>();
  const queue: RoundEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as AppToGameEvent | undefined;
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    for (const h of handlers) h(data);
  };
  window.addEventListener('message', onMessage);

  const flush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!queue.length) return;
    post({ type: 'GAME_EVENTS', events: queue.splice(0, queue.length) });
  };

  return {
    ready() {
      post({ type: 'GAME_READY', protocol: BRIDGE_PROTOCOL_VERSION });
    },
    start(sessionId) {
      post({ type: 'GAME_START', sessionId });
    },
    gameOver(score, sessionId, durationMs) {
      post({ type: 'GAME_OVER', score, sessionId, durationMs });
    },
    claimReward(rewardId, sessionId) {
      post({ type: 'REWARD_CLAIM', rewardId, sessionId });
    },
    track(name, payload) {
      post({ type: 'GAME_EVENT', name, payload });
    },
    sendEvent(event) {
      queue.push({ ...event, clientTs: Date.now() });
      if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
    },
    sendResult(result) {
      flush();
      post({ type: 'GAME_RESULT', result });
    },
    flushEvents() {
      flush();
    },
    exit(sessionId) {
      post({ type: 'GAME_EXIT', sessionId });
    },
    error(message) {
      post({ type: 'GAME_ERROR', message });
    },
    onApp(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy() {
      flush();
      handlers.clear();
      window.removeEventListener('message', onMessage);
    },
  };
}
