import { Scene } from 'phaser';
import type { Locale } from '../../core/locale';
import {
  setBackHandler, applyTheme, setupCamera, makeBonusChip, playSound, motionAllowed,
  makePhoenix, makeStarRow, makeKidsPlayButton, C, TYPE,
} from '../ui';
import { COLORS, FONT } from '../palette';
import { DPR } from '../dpr';
import { levelAt, LADDER_SIZE } from '../../core/levels';
import { pictureById } from '../../core/pictures';
import { BASE_FRAME, ensurePictureTexture } from '../picture';
import { settleLadderRound, starsFor, loadProgress, isUnlocked } from '@gamewingo/game-progress';
import confetti from 'canvas-confetti';

interface LastGame {
  locale: Locale;
  level: number;
  /** Партия была уровнем дня. */
  daily?: boolean;
  pieces: number;
  wrongDrops: number;
  durationMs: number;
  score: number;
  picture: string;
}

const SLUG = 'jigsaw';
const CX = 200;
/** Собранная картинка — главная награда пазла, поэтому крупно, во всю колонку. */
const PIC = 240;
const PIC_Y = 64 + PIC / 2;
/**
 * Феникс поменьше — радуется рядом с кнопкой «дальше» и смотрит на неё.
 * Не на картинке: закрывать награду нельзя.
 */
const PHOENIX = 96;

/**
 * Итог детского пазла (T8, раздел 1g аудита): собранная картинка крупно,
 * под ней одной строкой её история — для родителя, который читает вслух;
 * три звезды и одна большая кнопка «дальше», рядом с ней радуется феникс. Очков,
 * лидерборда, «почти» и заголовков нет — ребёнок 3–6 лет не читает.
 *
 * Общий `makeKidsResult` здесь не подходит: его феникс на 150 занимает место,
 * где у пазла должна быть картинка, а картинка и история — то, что меню обещает
 * за сборку. Итог собран из тех же деталей game-ui: звёзды, феникс, кнопка.
 *
 * Проиграть в пазле нельзя: собрал — значит прошёл. Звёзды меряются промахами.
 */
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    // Системный «назад» с экрана итогов — в меню игры.
    setBackHandler(() => this.scene.start('MainMenu'));
    applyTheme(this);
    setupCamera(this);
    this.cameras.main.fadeIn(220, ...COLORS.fade);
    const last = this.registry.get('lastGame') as LastGame;
    const loc = last.locale;
    const picture = pictureById(last.picture);

    const level = levelAt(last.level);
    const stars = starsFor(level.goals, last.wrongDrops);
    // Итог одним вызовом: лестница, счётчики дня и бонусы. Бонусы — доход родителя.
    const { bonus } = settleLadderRound({
      slug: SLUG, n: last.level, total: LADDER_SIZE,
      mode: last.daily ? 'dailyLevel' : 'level',
      cleared: true, stars, score: last.score,
    });

    playSound('win');
    confetti({ disableForReducedMotion: true, particleCount: 90, spread: 70, origin: { y: 0.35 } });

    // Картинка целиком — награда за сборку.
    const key = ensurePictureTexture(this, last.picture);
    const frame = this.add.graphics();
    const half = PIC / 2 + 6;
    frame.fillStyle(C.surface, 1).fillRoundedRect(CX - half, PIC_Y - half, half * 2, half * 2, 18);
    frame.lineStyle(1, C.divider, 1).strokeRoundedRect(CX - half, PIC_Y - half, half * 2, half * 2, 18);
    const image = this.add.image(CX, PIC_Y, key, BASE_FRAME).setDisplaySize(PIC, PIC);
    if (motionAllowed()) {
      const sx = image.scaleX;
      const sy = image.scaleY;
      image.setScale(0);
      frame.setAlpha(0);
      this.tweens.add({ targets: image, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' });
      this.tweens.add({ targets: frame, alpha: 1, duration: 300 });
    }

    // История — единственный текст на экране: её читает вслух взрослый.
    const story = this.add
      .text(CX, PIC_Y + half + 14, picture.story[loc], {
        fontFamily: FONT, fontSize: 14, color: COLORS.storyInk,
        align: 'center', wordWrap: { width: 344 }, lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setResolution(DPR);

    const starsY = story.y + story.height + 46;
    const row = makeStarRow(this, CX, starsY, stars, TYPE.display - 4);
    if (motionAllowed()) {
      row.setScale(0);
      this.tweens.add({ targets: row, scale: 1, duration: 420, delay: 380, ease: 'Back.easeOut' });
    }
    for (let i = 0; i < stars; i++) this.time.delayedCall(420 + i * 170, () => playSound('star'));

    // Одна кнопка «дальше»: следующая картинка, если открыта; иначе — в меню.
    const nextN = last.level + 1;
    const hasNext = !last.daily && nextN <= LADDER_SIZE && isUnlocked(loadProgress(SLUG), nextN);
    const nextY = starsY + 110;
    makeKidsPlayButton(this, CX, nextY, () => (hasNext ? this.play(nextN) : this.scene.start('MainMenu')), 'next');
    const phoenix = makePhoenix(this, CX + 118, nextY + 8, PHOENIX, { facing: 'left' });
    this.time.delayedCall(300, () => phoenix.celebrate());
    this.events.once('shutdown', () => phoenix.destroy());

    const bonusChip = makeBonusChip(this, 386, 30);
    if (bonus.total > 0) {
      // Чип создан после начисления — откатываем показ на баланс «до»,
      // чтобы прилёт «+N» докрутил его до нового, а не удвоил прибавку.
      bonusChip.setValue(bonus.balance - bonus.total);
      this.time.delayedCall(1100, () => {
        playSound('coin');
        bonusChip.award(bonus.total, CX, starsY);
      });
    }
  }

  private play(n: number) {
    this.registry.set('level', n);
    this.registry.set('mode', 'level');
    this.scene.start('Game');
  }
}
