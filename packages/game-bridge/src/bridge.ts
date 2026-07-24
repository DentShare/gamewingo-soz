import type { AppToGameEvent, GameToAppEvent } from './events.js';
import { BRIDGE_PROTOCOL_VERSION } from './events.js';

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
  /** Сообщить об ошибке. */
  error(message: string): void;
  /** Подписаться на события от приложения. Возвращает функцию отписки. */
  onApp(handler: Handler): () => void;
  /** Снять слушатель window.message (при уничтожении игры). */
  destroy(): void;
}

export function createBridge(): GameBridge {
  const handlers = new Set<Handler>();

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as AppToGameEvent | undefined;
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    for (const h of handlers) h(data);
  };
  window.addEventListener('message', onMessage);

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
    error(message) {
      post({ type: 'GAME_ERROR', message });
    },
    onApp(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    destroy() {
      handlers.clear();
      window.removeEventListener('message', onMessage);
    },
  };
}
