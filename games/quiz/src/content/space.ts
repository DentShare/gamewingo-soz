import { q, type Question } from './types';

/** Космос. Первый вариант в каждом вопросе — верный. */
export const SPACE: Question[] = [
  q('space-biggest', 'space',
    { ru: 'Какая планета Солнечной системы самая большая?', uz: 'Quyosh sistemasidagi eng katta sayyora qaysi?' },
    [
      { ru: 'Юпитер', uz: 'Yupiter' },
      { ru: 'Сатурн', uz: 'Saturn' },
      { ru: 'Земля', uz: 'Yer' },
      { ru: 'Марс', uz: 'Mars' },
    ],
    { ru: 'В Юпитер поместилось бы больше тысячи таких планет, как Земля.',
      uz: 'Yupiter ichiga Yerdek mingdan ortiq sayyora sigʻadi.' }),

  q('space-light', 'space',
    { ru: 'Сколько времени свет от Солнца летит до Земли?', uz: 'Quyosh nuri Yerga qancha vaqtda yetib keladi?' },
    [
      { ru: 'Около 8 минут', uz: 'Taxminan 8 daqiqada' },
      { ru: 'Около 8 секунд', uz: 'Taxminan 8 soniyada' },
      { ru: 'Около 8 часов', uz: 'Taxminan 8 soatda' },
    ],
    { ru: 'Мы всегда видим Солнце таким, каким оно было 8 минут назад.',
      uz: 'Biz Quyoshni doim 8 daqiqa oldingi holatida koʻramiz.' }),

  q('space-hottest', 'space',
    { ru: 'Какая планета самая горячая?', uz: 'Eng issiq sayyora qaysi?' },
    [
      { ru: 'Венера', uz: 'Venera' },
      { ru: 'Меркурий', uz: 'Merkuriy' },
      { ru: 'Марс', uz: 'Mars' },
    ],
    { ru: 'Меркурий ближе к Солнцу, но плотная атмосфера Венеры держит тепло: там около 460 °C.',
      uz: 'Merkuriy Quyoshga yaqinroq, ammo Veneraning quyuq atmosferasi issiqni ushlab qoladi: u yerda 460 °C atrofida.' }),

  q('space-venus-day', 'space',
    { ru: 'На какой планете сутки длиннее года?', uz: 'Qaysi sayyorada bir kun bir yildan uzun?' },
    [
      { ru: 'Венера', uz: 'Venera' },
      { ru: 'Марс', uz: 'Mars' },
      { ru: 'Нептун', uz: 'Neptun' },
    ],
    { ru: 'Венера крутится вокруг оси 243 земных дня, а вокруг Солнца облетает за 225.',
      uz: 'Venera oʻz oʻqi atrofida 243 kunda, Quyosh atrofida esa 225 kunda aylanadi.' }),

  q('space-gagarin', 'space',
    { ru: 'Кто первым полетел в космос?', uz: 'Kosmosga birinchi boʻlib kim uchgan?' },
    [
      { ru: 'Юрий Гагарин', uz: 'Yuriy Gagarin' },
      { ru: 'Нил Армстронг', uz: 'Nil Armstrong' },
      { ru: 'Валентина Терешкова', uz: 'Valentina Tereshkova' },
    ],
    { ru: 'Полёт 12 апреля 1961 года длился 108 минут — один виток вокруг Земли.',
      uz: '1961-yil 12-aprel parvozi 108 daqiqa davom etdi — Yer atrofida bir aylanish.' }),

  q('space-moon-jump', 'space',
    { ru: 'Почему на Луне прыгать легче, чем на Земле?', uz: 'Nega Oyda sakrash Yerdagidan oson?' },
    [
      { ru: 'Притяжение в 6 раз слабее', uz: 'Tortishish 6 barobar kuchsiz' },
      { ru: 'Там нет воздуха', uz: 'U yerda havo yoʻq' },
      { ru: 'Луна меньше нагревается', uz: 'Oy kamroq qiziydi' },
    ],
    { ru: 'Человек, который на Земле прыгает на полметра, на Луне подпрыгнул бы на три.',
      uz: 'Yerda yarim metr sakraydigan odam Oyda uch metr sakragan boʻlardi.' }),

  q('space-sun-made', 'space',
    { ru: 'Из чего в основном состоит Солнце?', uz: 'Quyosh asosan nimadan iborat?' },
    [
      { ru: 'Из водорода и гелия', uz: 'Vodorod va geliydan' },
      { ru: 'Из раскалённого камня', uz: 'Qizigan toshdan' },
      { ru: 'Из железа', uz: 'Temirdan' },
    ],
    { ru: 'Солнце — огромный шар горячего газа; каждую секунду в нём водород превращается в гелий.',
      uz: 'Quyosh — issiq gazdan iborat ulkan shar; unda har soniyada vodorod geliyga aylanadi.' }),

  q('space-planets', 'space',
    { ru: 'Сколько планет в Солнечной системе?', uz: 'Quyosh sistemasida nechta sayyora bor?' },
    [
      { ru: 'Восемь', uz: 'Sakkizta' },
      { ru: 'Девять', uz: 'Toʻqqizta' },
      { ru: 'Семь', uz: 'Yettita' },
    ],
    { ru: 'С 2006 года Плутон считается карликовой планетой, поэтому больших планет восемь.',
      uz: '2006-yildan Pluton mitti sayyora hisoblanadi, shuning uchun katta sayyoralar sakkizta.' }),

  q('space-galaxy', 'space',
    { ru: 'Что такое Млечный Путь?', uz: 'Somon yoʻli nima?' },
    [
      { ru: 'Наша галактика', uz: 'Bizning galaktikamiz' },
      { ru: 'Другое название Солнца', uz: 'Quyoshning boshqa nomi' },
      { ru: 'Скопление комет', uz: 'Kometalar toʻplami' },
    ],
    { ru: 'В нашей галактике сотни миллиардов звёзд, и Солнце — одна из них.',
      uz: 'Galaktikamizda yuz milliardlab yulduz bor, Quyosh ulardan biri.' }),

  q('space-comet', 'space',
    { ru: 'Из чего состоит комета?', uz: 'Kometa nimadan iborat?' },
    [
      { ru: 'Из льда, пыли и камня', uz: 'Muz, chang va toshdan' },
      { ru: 'Из чистого огня', uz: 'Sof olovdan' },
      { ru: 'Из расплавленного металла', uz: 'Erigan metalldan' },
    ],
    { ru: 'Хвост появляется, когда комета подлетает к Солнцу и лёд превращается в газ.',
      uz: 'Kometa Quyoshga yaqinlashganda muz gazga aylanadi va dum paydo boʻladi.' }),
];
