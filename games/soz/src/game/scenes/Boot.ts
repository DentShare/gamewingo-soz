import { Scene } from 'phaser';
import { createBridge, createApiClient } from '@gamewingo/game-bridge';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createSession } from '../../bridge/session';
import { createDemoApi, installDemoApp, DEMO_API_BASE } from '../../bridge/demo';
import { computeDayId } from '../../core/dailyWord';
import { getHighContrast } from '../../core/persistence';

/**
 * Boot: поднимает мост, ждёт INIT от приложения. Если INIT не пришёл (веб/дев вне
 * WinGo) — включает демо-бэкенд (баллы/стрик/лидерборд локально) и стартует меню.
 */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const bridge = createBridge();
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
      this.registry.set('dayId', computeDayId());
      this.registry.set('highContrast', getHighContrast());
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
        installDemoApp(); // живёт весь сеанс (single-page); чистить не нужно
        this.registry.set('demo', true);
        session.applyInit({
          type: 'INIT', authToken: 'demo', apiBaseUrl: DEMO_API_BASE, locale: 'ru', sessionId: 'demo',
        });
      }
      proceed();
    });
  }
}
