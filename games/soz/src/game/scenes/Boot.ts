import { Scene } from 'phaser';
import { createBridge, createApiClient } from '@gamewingo/game-bridge';
import type { AppToGameEvent } from '@gamewingo/game-bridge';
import { createSession } from '../../bridge/session';
import { computeDayId } from '../../core/dailyWord';

/**
 * Boot: поднимает мост, ждёт INIT от приложения (в вебе — фолбэк по таймауту),
 * кладёт session/locale/theme/dayId в registry и уходит в меню.
 */
export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const bridge = createBridge();
    const session = createSession(bridge, (base, token) =>
      createApiClient({ baseUrl: base, authToken: token }),
    );

    let started = false;
    const proceed = () => {
      if (started) return;
      started = true;
      this.registry.set('session', session);
      this.registry.set('locale', session.locale);
      this.registry.set('theme', session.theme ?? null);
      this.registry.set('dayId', computeDayId());
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

    // Локальная разработка / веб без хоста: если INIT не пришёл — стартуем с дефолтами.
    this.time.delayedCall(700, () => {
      off();
      proceed();
    });
  }
}
