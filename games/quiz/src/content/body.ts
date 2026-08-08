import { q, type Question } from './types';

/** Тело человека. Первый вариант в каждом вопросе — верный. */
export const BODY: Question[] = [
  q('body-bones', 'body',
    { ru: 'Сколько костей у взрослого человека?', uz: 'Kattalar tanasida nechta suyak bor?' },
    [
      { ru: 'Около 206', uz: 'Taxminan 206 ta' },
      { ru: 'Около 300', uz: 'Taxminan 300 ta' },
      { ru: 'Около 120', uz: 'Taxminan 120 ta' },
    ],
    { ru: 'Младенец рождается примерно с тремя сотнями костей — с возрастом часть срастается.',
      uz: 'Chaqaloq taxminan uch yuz suyak bilan tugʻiladi — yoshi ulgʻaygan sari bir qismi qoʻshilib ketadi.' }),

  q('body-heart', 'body',
    { ru: 'Какой орган гоняет кровь по телу?', uz: 'Qaysi aʼzo qonni tana boʻylab haydaydi?' },
    [
      { ru: 'Сердце', uz: 'Yurak' },
      { ru: 'Печень', uz: 'Jigar' },
      { ru: 'Лёгкие', uz: 'Oʻpka' },
    ],
    { ru: 'За сутки сердце делает около ста тысяч ударов и не отдыхает ни минуты.',
      uz: 'Bir kunda yurak yuz mingga yaqin uradi va bir daqiqa ham dam olmaydi.' }),

  q('body-largest', 'body',
    { ru: 'Какой орган человека самый большой?', uz: 'Odamning eng katta aʼzosi qaysi?' },
    [
      { ru: 'Кожа', uz: 'Teri' },
      { ru: 'Печень', uz: 'Jigar' },
      { ru: 'Мозг', uz: 'Miya' },
    ],
    { ru: 'Кожа взрослого — около двух квадратных метров и целиком обновляется примерно за месяц.',
      uz: 'Kattalarning terisi taxminan ikki kvadrat metr va bir oyda toʻliq yangilanadi.' }),

  q('body-teeth', 'body',
    { ru: 'Сколько зубов у взрослого человека?', uz: 'Kattalarda nechta tish boʻladi?' },
    [
      { ru: '32', uz: '32 ta' },
      { ru: '20', uz: '20 ta' },
      { ru: '28 всегда', uz: 'Har doim 28 ta' },
    ],
    { ru: 'Молочных зубов у ребёнка двадцать, постоянных — тридцать два вместе с зубами мудрости.',
      uz: 'Bolada yigirmata sut tishi, kattalarda aql tishlari bilan birga oʻttiz ikkita tish boʻladi.' }),

  q('body-enamel', 'body',
    { ru: 'Что в теле человека самое твёрдое?', uz: 'Inson tanasidagi eng qattiq narsa nima?' },
    [
      { ru: 'Зубная эмаль', uz: 'Tish emali' },
      { ru: 'Кость черепа', uz: 'Kalla suyagi' },
      { ru: 'Ноготь', uz: 'Tirnoq' },
    ],
    { ru: 'Эмаль твёрже кости, но не умеет заживать сама — поэтому её и берегут.',
      uz: 'Emal suyakdan qattiq, ammo oʻzi tiklana olmaydi — shuning uchun uni asrash kerak.' }),

  q('body-blood', 'body',
    { ru: 'Сколько примерно крови у взрослого человека?', uz: 'Kattalarda taxminan qancha qon boʻladi?' },
    [
      { ru: 'Около 5 литров', uz: 'Taxminan 5 litr' },
      { ru: 'Около 15 литров', uz: 'Taxminan 15 litr' },
      { ru: 'Около 1 литра', uz: 'Taxminan 1 litr' },
    ],
    { ru: 'Полный круг по телу кровь проходит меньше чем за минуту.',
      uz: 'Qon tana boʻylab toʻliq aylanani bir daqiqadan kam vaqtda bosib oʻtadi.' }),

  q('body-lungs', 'body',
    { ru: 'Зачем человеку лёгкие?', uz: 'Odamga oʻpka nima uchun kerak?' },
    [
      { ru: 'Брать кислород и отдавать углекислый газ', uz: 'Kislorod olib, karbonat angidridni chiqarish uchun' },
      { ru: 'Переваривать пищу', uz: 'Ovqatni hazm qilish uchun' },
      { ru: 'Очищать кровь от сахара', uz: 'Qonni shakardan tozalash uchun' },
    ],
    { ru: 'В спокойном состоянии человек делает около 20 тысяч вдохов в сутки.',
      uz: 'Tinch holatda odam kuniga 20 mingga yaqin nafas oladi.' }),

  q('body-brain', 'body',
    { ru: 'Что защищает мозг от ударов?', uz: 'Miyani zarbadan nima himoya qiladi?' },
    [
      { ru: 'Кости черепа', uz: 'Kalla suyaklari' },
      { ru: 'Мышцы шеи', uz: 'Boʻyin mushaklari' },
      { ru: 'Кожа головы', uz: 'Bosh terisi' },
    ],
    { ru: 'Мозг весит около полутора килограммов, но тратит примерно пятую часть всей энергии тела.',
      uz: 'Miya bir yarim kilogrammga yaqin, ammo tana energiyasining beshdan bir qismini sarflaydi.' }),

  q('body-sleep', 'body',
    { ru: 'Зачем человеку сон?', uz: 'Odamga uyqu nima uchun kerak?' },
    [
      { ru: 'Восстанавливаться и запоминать', uz: 'Tiklanish va eslab qolish uchun' },
      { ru: 'Только чтобы не уставали глаза', uz: 'Faqat koʻz charchamasligi uchun' },
      { ru: 'Чтобы кости росли ровнее', uz: 'Suyaklar tekis oʻsishi uchun' },
    ],
    { ru: 'Во сне мозг раскладывает по полочкам всё, что случилось за день, — так и запоминается.',
      uz: 'Uyquda miya kun davomida sodir boʻlgan narsalarni tartibga soladi — shunda eslab qolinadi.' }),

  q('body-water', 'body',
    { ru: 'Из чего человек состоит больше всего?', uz: 'Odam koʻproq nimadan iborat?' },
    [
      { ru: 'Из воды', uz: 'Suvdan' },
      { ru: 'Из жира', uz: 'Yogʻdan' },
      { ru: 'Из костей', uz: 'Suyakdan' },
    ],
    { ru: 'У взрослого вода — больше половины массы тела, поэтому её надо регулярно восполнять.',
      uz: 'Kattalarda suv tana massasining yarmidan koʻpini tashkil qiladi, shuning uchun uni muntazam toʻldirish kerak.' }),
];
