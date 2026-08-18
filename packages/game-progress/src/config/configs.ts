import type { GameId } from '@gamewingo/game-bridge';
import type { AntiFraudLimits, ProgressionConfig } from './types.js';
import { starsGte, starsLte } from './helpers.js';

/**
 * Конфиги прогрессии всех 11 игр — стартовый баланс событийного скоринга.
 *
 * Балльные правила (`scoring`) — посев для Score Engine: цифры компания крутит
 * в админке без релиза, здесь только осмысленная точка отсчёта. Метрики звёзд
 * (`starMetric`) обязаны совпадать с тем, что игра реально передаёт в
 * result.metrics — они сверены с GameOver каждой игры и покрыты тестом.
 *
 * Уровней здесь нет: лестницы живут в games/<slug>/src/core/levels.ts и
 * подшиваются в выгрузку скриптом progression:export.
 */

const AF: AntiFraudLimits = {
  maxScorePerSession: 20_000,
  maxSessionMs: 15 * 60_000,
  maxEventsPerMinute: 240,
};

export const GAME_CONFIGS: Record<GameId, ProgressionConfig> = {

  /* ── «5 букв» — слово из пяти букв, попытки на вес золота ───────────── */
  soz: {
    gameId: 'soz', version: 1,
    scoring: [
      // Чем больше попыток осталось, тем дороже отгадка: 1 + 0.25 × остаток.
      { event: 'word_guessed', base: 100,
        modifiers: [{ source: 'attemptsLeft', type: 'linear', factor: 0.25, cap: 2.5 }] },
      { event: 'first_try', base: 50 },
      { event: 'session_complete', base: 20 },
    ],
    starMetric: 'guessesUsed',
    starsFallback: starsLte('guessesUsed', 6, 4, 2),
    dailyQuests: [
      { id: 'soz_q_words3', title: { ru: 'Угадай 3 слова', uz: '3 ta soʻz top' },
        metric: 'wordsGuessed', target: 3, reward: 30 },
      { id: 'soz_q_streak5', title: { ru: 'Серия 5 дней', uz: '5 kun seriya' },
        metric: 'streakDays', target: 5, reward: 100 },
    ],
    achievements: [
      { id: 'soz_erudite', title: { ru: 'Эрудит', uz: 'Bilimdon' },
        metric: 'wordsGuessed', op: 'gte', value: 100, reward: 200 },
      { id: 'soz_lightning', title: { ru: 'Молния', uz: 'Chaqqon' },
        metric: 'firstTryCount', op: 'gte', value: 10, reward: 150 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 10_000, maxEventsPerMinute: 60 },
  },

  /* ── «Найди пару» — память и серии ──────────────────────────────────── */
  pairs: {
    gameId: 'pairs', version: 1,
    scoring: [
      { event: 'pair_found', base: 20,
        modifiers: [{ source: 'consecutive', type: 'linear', factor: 0.5, cap: 3 }] },
      { event: 'session_complete', base: 100,
        modifiers: [{ source: 'efficiency', type: 'linear', factor: 1, cap: 2 }] },
      // Партия без единой ошибки.
      { event: 'flawless', base: 50 },
    ],
    starMetric: 'moves',
    starsFallback: starsLte('moves', 40, 28, 20),
    dailyQuests: [
      { id: 'pairs_q_pairs10', title: { ru: 'Найди 10 пар', uz: '10 juftlik top' },
        metric: 'pairsFound', target: 10, reward: 40 },
      { id: 'pairs_q_combo5', title: { ru: '5 пар подряд', uz: '5 juft ketma-ket' },
        metric: 'bestCombo', target: 5, reward: 30 },
    ],
    achievements: [
      { id: 'pairs_memory', title: { ru: 'Феноменальная память', uz: 'Zoʻr xotira' },
        metric: 'flawlessCount', op: 'gte', value: 5, reward: 200 },
      { id: 'pairs_sprinter', title: { ru: 'Спринтер', uz: 'Tezkor' },
        metric: 'fastWins', op: 'gte', value: 10, reward: 150 },
    ],
    antiFraud: AF,
  },

  /* ── «Пятнашки» — ходы решают всё ───────────────────────────────────── */
  fifteen: {
    gameId: 'fifteen', version: 1,
    scoring: [
      { event: 'session_complete', base: 500,
        modifiers: [{ source: 'movesEfficiency', type: 'linear', factor: 1.2, cap: 2 }] },
      { event: 'speed_bonus', base: 100 },
    ],
    starMetric: 'moves',
    starsFallback: starsLte('moves', 120, 80, 60),
    dailyQuests: [
      { id: 'fifteen_q_solve3', title: { ru: 'Реши 3 головоломки', uz: '3 ta boshqotirma yech' },
        metric: 'solved', target: 3, reward: 60 },
    ],
    achievements: [
      { id: 'fifteen_grand', title: { ru: 'Гроссмейстер', uz: 'Grossmeyster' },
        metric: 'optimalWins', op: 'gte', value: 10, reward: 250 },
    ],
    antiFraud: AF,
  },

  /* ── «2048» — номинал плитки как естественная лестница ──────────────── */
  '2048': {
    gameId: '2048', version: 1,
    scoring: [
      // Слияние даёт номинал новой плитки; серия слияний подряд — до ×2.
      { event: 'tile_merged', base: 1, perItemKey: 'value',
        modifiers: [{ source: 'combo', type: 'linear', factor: 0.2, cap: 2 }] },
      // Новый личный максимум номинала; от 128 — вдвое дороже.
      { event: 'new_high_tile', base: 1, perItemKey: 'value',
        modifiers: [{ source: 'value', type: 'threshold', threshold: 128, multiplier: 2 }] },
      { event: 'game_won', base: 200 },
    ],
    starMetric: 'score',
    starsFallback: starsGte('maxTile', 512, 1024, 2048),
    dailyQuests: [
      { id: 'g2048_q_tile512', title: { ru: 'Собери плитку 512', uz: '512 plitka yigʻ' },
        metric: 'maxTile', target: 512, reward: 50 },
      { id: 'g2048_q_wins3', title: { ru: 'Выиграй 3 партии', uz: '3 ta oʻyinda yut' },
        metric: 'wins', target: 3, reward: 80 },
    ],
    achievements: [
      { id: 'g2048_master', title: { ru: 'Мастер 2048', uz: '2048 ustasi' },
        metric: 'maxTile', op: 'gte', value: 2048, reward: 300 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 50_000, maxEventsPerMinute: 400 },
  },

  /* ── «Мини-судоку» — звёзды за скорость, как в лестнице игры ────────── */
  'sudoku-kids': {
    gameId: 'sudoku-kids', version: 1,
    scoring: [
      { event: 'cell_correct', base: 10,
        modifiers: [{ source: 'consecutive', type: 'linear', factor: 0.3, cap: 2 }] },
      { event: 'session_complete', base: 300,
        modifiers: [{ source: 'accuracy', type: 'linear', factor: 1, cap: 2 }] },
      { event: 'no_hints', base: 100 },
    ],
    starMetric: 'timeSec',
    starsFallback: starsLte('timeSec', 300, 180, 100),
    dailyQuests: [
      { id: 'sudoku_q_solve2', title: { ru: 'Реши 2 судоку', uz: '2 ta sudoku yech' },
        metric: 'solved', target: 2, reward: 40 },
    ],
    achievements: [
      { id: 'sudoku_perfect', title: { ru: 'Безупречный', uz: 'Mukammal' },
        metric: 'noMistakeWins', op: 'gte', value: 10, reward: 200 },
    ],
    antiFraud: AF,
  },

  /* ── «Башня» — высота и точность укладки ────────────────────────────── */
  stack: {
    gameId: 'stack', version: 1,
    scoring: [
      { event: 'block_placed', base: 10,
        modifiers: [{ source: 'height', type: 'linear', factor: 0.1, cap: 3 }] },
      { event: 'perfect_placement', base: 20 },
      { event: 'combo_perfect', base: 50 },
    ],
    starMetric: 'score',
    starsFallback: starsGte('height', 20, 40, 60),
    dailyQuests: [
      { id: 'stack_q_height30', title: { ru: 'Башня из 30 блоков', uz: '30 blokli minora' },
        metric: 'height', target: 30, reward: 60 },
    ],
    achievements: [
      { id: 'stack_architect', title: { ru: 'Архитектор', uz: 'Meʼmor' },
        metric: 'bestHeight', op: 'gte', value: 100, reward: 300 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 100_000, maxEventsPerMinute: 500 },
  },

  /* ── «Полёт» — дистанция и увороты ──────────────────────────────────── */
  flyer: {
    gameId: 'flyer', version: 1,
    scoring: [
      { event: 'distance', base: 1, perItemKey: 'units' },
      { event: 'obstacle_avoided', base: 15 },
      // Пролетел впритирку — риск оплачивается.
      { event: 'close_call', base: 10 },
    ],
    starMetric: 'score',
    starsFallback: starsGte('distance', 1000, 3000, 5000),
    dailyQuests: [
      { id: 'flyer_q_dist2000', title: { ru: 'Пролети 2000', uz: '2000 masofa uch' },
        metric: 'distance', target: 2000, reward: 50 },
    ],
    achievements: [
      { id: 'flyer_ace', title: { ru: 'Ас', uz: 'Uchuvchilar ustasi' },
        metric: 'bestDistance', op: 'gte', value: 10_000, reward: 300 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 100_000, maxEventsPerMinute: 600 },
  },

  /* ── «Меткий глаз» — точность и серии попаданий ─────────────────────── */
  targets: {
    gameId: 'targets', version: 1,
    scoring: [
      { event: 'target_hit', base: 20,
        modifiers: [{ source: 'accuracy', type: 'linear', factor: 1, cap: 2 }] },
      { event: 'bullseye', base: 30 },
      { event: 'combo_hit', base: 50 },
    ],
    starMetric: 'score',
    starsFallback: starsGte('score', 500, 1000, 1500),
    dailyQuests: [
      { id: 'targets_q_score800', title: { ru: 'Набери 800 очков', uz: '800 ball toʻpla' },
        metric: 'score', target: 800, reward: 40 },
    ],
    achievements: [
      { id: 'targets_sniper', title: { ru: 'Снайпер', uz: 'Snayper' },
        metric: 'bullseyes', op: 'gte', value: 200, reward: 250 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 50_000, maxEventsPerMinute: 500 },
  },

  /* ── «Змейка» — длина кормит счёт ───────────────────────────────────── */
  snake: {
    gameId: 'snake', version: 1,
    scoring: [
      { event: 'food_eaten', base: 10,
        modifiers: [{ source: 'length', type: 'linear', factor: 0.05, cap: 3 }] },
      { event: 'special_food', base: 50 },
    ],
    starMetric: 'score',
    starsFallback: starsGte('length', 15, 30, 50),
    dailyQuests: [
      { id: 'snake_q_len25', title: { ru: 'Длина 25', uz: '25 uzunlikka yet' },
        metric: 'length', target: 25, reward: 50 },
    ],
    achievements: [
      { id: 'snake_giant', title: { ru: 'Гигант', uz: 'Ulkan ilon' },
        metric: 'bestLength', op: 'gte', value: 100, reward: 300 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 100_000, maxEventsPerMinute: 500 },
  },

  /* ── «Сортировка» — детская, проигрыша нет, звёзды за аккуратность ──── */
  sorting: {
    gameId: 'sorting', version: 1,
    scoring: [
      { event: 'item_sorted', base: 15,
        modifiers: [{ source: 'consecutive', type: 'linear', factor: 0.2, cap: 2 }] },
      { event: 'session_complete', base: 100 },
      { event: 'speed_bonus', base: 20 },
    ],
    starMetric: 'mistakes',
    starsFallback: starsLte('mistakes', 4, 2, 0),
    dailyQuests: [
      { id: 'sorting_q_items30', title: { ru: 'Отсортируй 30 предметов', uz: '30 ta buyumni saralab chiq' },
        metric: 'itemsSorted', target: 30, reward: 30 },
    ],
    achievements: [
      { id: 'sorting_attentive', title: { ru: 'Внимательный', uz: 'Diqqatli' },
        metric: 'bestStreak', op: 'gte', value: 50, reward: 150 },
    ],
    antiFraud: AF,
  },

  /* ── «Викторина» — вопросы и факты по шести темам ───────────────────── */
  quiz: {
    gameId: 'quiz', version: 1,
    scoring: [
      { event: 'correct_answer', base: 100,
        // Ответ до истечения таймера ценнее: множитель растёт с остатком времени.
        modifiers: [{ source: 'timeLeftSec', type: 'linear', factor: 0.02, cap: 1.5 }] },
      { event: 'session_complete', base: 100,
        modifiers: [{ source: 'accuracy', type: 'linear', factor: 1, cap: 2 }] },
      { event: 'flawless_round', base: 200 },
    ],
    starMetric: 'mistakes',
    starsFallback: starsLte('mistakes', 4, 2, 0),
    dailyQuests: [
      { id: 'quiz_q_correct15', title: { ru: '15 верных ответов', uz: '15 ta toʻgʻri javob' },
        metric: 'correctAnswers', target: 15, reward: 40 },
      { id: 'quiz_q_topics3', title: { ru: 'Сыграй по 3 темам', uz: '3 ta mavzuda oʻyna' },
        metric: 'topicsPlayed', target: 3, reward: 30 },
    ],
    achievements: [
      { id: 'quiz_erudite', title: { ru: 'Эрудит каталога', uz: 'Katalog bilimdoni' },
        metric: 'correctAnswers', op: 'gte', value: 200, reward: 250 },
      { id: 'quiz_flawless', title: { ru: 'Без единой ошибки', uz: 'Bironta ham xatosiz' },
        metric: 'flawlessRounds', op: 'gte', value: 10, reward: 200 },
    ],
    antiFraud: AF,
  },

  /* ── «Пазл» — детская, проигрыша нет, звёзды за аккуратность ────────── */
  jigsaw: {
    gameId: 'jigsaw', version: 1,
    scoring: [
      { event: 'piece_placed', base: 50 },
      { event: 'session_complete', base: 100 },
      // Собрал без единого промаха — отдельная награда.
      { event: 'flawless_picture', base: 200 },
    ],
    starMetric: 'wrongDrops',
    starsFallback: starsLte('wrongDrops', 8, 4, 0),
    dailyQuests: [
      { id: 'jigsaw_q_pictures2', title: { ru: 'Собери 2 картинки', uz: '2 ta rasm yigʻ' },
        metric: 'pictures', target: 2, reward: 40 },
    ],
    achievements: [
      { id: 'jigsaw_collector', title: { ru: 'Собиратель картинок', uz: 'Rasm toʻplovchi' },
        metric: 'pictures', op: 'gte', value: 30, reward: 200 },
    ],
    antiFraud: { ...AF, maxScorePerSession: 5_000 },
  },

  /* ── «Суммы» — вычёркивание лишних чисел, проигрыша нет ─────────────── */
  sums: {
    gameId: 'sums', version: 1,
    scoring: [
      // Единица прогресса — сошедшаяся строка или столбец: это видно на доске
      // и не отменяется случайным тапом, в отличие от отдельного вычёркивания.
      { event: 'line_solved', base: 30 },
      { event: 'session_complete', base: 200,
        modifiers: [{ source: 'accuracy', type: 'linear', factor: 1, cap: 2 }] },
      // Решил без единого лишнего касания — отдельная награда за чистый расчёт.
      { event: 'no_extra_moves', base: 150 },
    ],
    starMetric: 'extraMoves',
    starsFallback: starsLte('extraMoves', 8, 4, 0),
    dailyQuests: [
      { id: 'sums_q_solve3', title: { ru: 'Реши 3 доски', uz: '3 ta doskani yech' },
        metric: 'solved', target: 3, reward: 40 },
    ],
    achievements: [
      { id: 'sums_clean', title: { ru: 'Чистый расчёт', uz: 'Toza hisob' },
        metric: 'flawlessRounds', op: 'gte', value: 10, reward: 200 },
    ],
    // Потолок очков экспорт подставит из MAX_SCORE игры (7290). Лимит длительности
    // здесь свой: над девяткой можно честно думать дольше общих пятнадцати минут,
    // а таймера, который бы это оборвал, в игре нет.
    antiFraud: { ...AF, maxScorePerSession: 10_000, maxSessionMs: 40 * 60_000 },
  },

  /* ── «Счёт» — детская, проигрыша нет, звёзды за аккуратность ────────── */
  counting: {
    gameId: 'counting', version: 1,
    scoring: [
      { event: 'correct_answer', base: 20,
        modifiers: [{ source: 'consecutive', type: 'linear', factor: 0.3, cap: 2 }] },
      { event: 'session_complete', base: 100 },
      { event: 'streak_bonus', base: 10 },
    ],
    starMetric: 'mistakes',
    starsFallback: starsLte('mistakes', 4, 2, 0),
    dailyQuests: [
      { id: 'counting_q_correct20', title: { ru: '20 правильных ответов', uz: '20 ta toʻgʻri javob' },
        metric: 'correctAnswers', target: 20, reward: 30 },
    ],
    achievements: [
      { id: 'counting_math', title: { ru: 'Юный математик', uz: 'Yosh matematik' },
        metric: 'levelsDone', op: 'gte', value: 15, reward: 200 },
    ],
    antiFraud: AF,
  },
};
