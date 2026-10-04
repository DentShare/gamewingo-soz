import { Scene } from 'phaser';
import { createBridge, createApiClient } from '@gamewingo/game-bridge';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createSession } from '../../bridge/session';
import { createDemoApi, DEMO_API_BASE } from '../../bridge/demo';
import { setupCamera, loadGameIcon, preferredLocale } from '../ui';
import { LADDER_SIZE, levelAt } from '../../core/levels';
import { t } from '../../i18n';

/**
 * Boot: поднимает мост, ждёт INIT от приложения. Если INIT не пришёл (веб/дев вне
 * WinGo) — включает демо-бэкенд и стартует меню.
 */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  /** Иконка игры — та же, что в каталоге; показывается в меню. */
  preload() {
    const label = document.getElementById('boot-label');
    if (label) label.textContent = t(preferredLocale(), 'boot.loading');
    loadGameIcon(this);
  }

  create() {
    setupCamera(this);
    this.registry.set('demo', false);
    this.registry.set('preview', false);
    const bridge = createBridge();
    const onError = (event: ErrorEvent) => bridge.error(event.message);
    const onRejection = (event: PromiseRejectionEvent) => bridge.error(String(event.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    this.game.events.once('destroy', () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      bridge.destroy();
    });
    const session = createSession(bridge, (base, token) =>
      base.startsWith('demo') ? createDemoApi() : createApiClient({ baseUrl: base, authToken: token }),
    );

    let started = false;
    const proceed = () => {
      if (started) return;
      started = true;
      this.registry.set('session', session);
      this.registry.set('locale', session.locale);
      this.registry.set('theme', session.theme ?? null);
      document.getElementById('boot-splash')?.remove();
      // Только локальная dev-проверка: не открывает уровни и не записывает награды.
      if (import.meta.env.DEV) {
        const params = new URL(window.location.href).searchParams;
        const previewLevel = Number(params.get('previewLevel'));
        if (Number.isInteger(previewLevel) && previewLevel >= 1 && previewLevel <= LADDER_SIZE) {
          this.registry.set('level', previewLevel);
          this.registry.set('preview', true);
          this.registry.set('howto', params.get('previewTutorial') === '1');
          if (params.get('previewResult')) {
            const level = levelAt(previewLevel);
            this.registry.set('lastGame', { level: previewLevel, locale: session.locale, moves: level.goals.gold + (params.get('previewResult') === 'gold' ? 0 : 1), par: level.par, durationMs: 42000 });
            this.scene.start('GameOver');
            return;
          }
          this.scene.start('Game');
          return;
        }
      }
      this.scene.start('MainMenu');
    };

    const off = session.onApp((e: AppToGameEvent) => {
      if (e.type === 'INIT') {
        session.applyInit(e);
        off();
        proceed();
      }
    });

    session.ready(); // GAME_READY

    // Нет хоста (веб/дев) → демо-режим: локальный бэкенд + дефолтная локаль/тема.
    this.time.delayedCall(700, () => {
      off();
      if (!started) {
        this.registry.set('demo', true);
        session.applyInit({
          type: 'INIT', authToken: 'demo', apiBaseUrl: DEMO_API_BASE,
          // Вне приложения язык берём из каталога: хаб и игры — один выбор.
          locale: preferredLocale(), sessionId: 'demo',
        });
      }
      proceed();
    });
  }
}
