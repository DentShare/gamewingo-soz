import { q, type Question } from './types';

/** Животные. Первый вариант в каждом вопросе — верный. */
export const ANIMALS: Question[] = [
  q('animals-biggest', 'animals',
    { ru: 'Какое животное самое большое на планете?', uz: 'Sayyoradagi eng katta hayvon qaysi?' },
    [
      { ru: 'Синий кит', uz: 'Koʻk kit' },
      { ru: 'Африканский слон', uz: 'Afrika fili' },
      { ru: 'Жираф', uz: 'Jirafa' },
    ],
    { ru: 'Язык синего кита весит примерно столько же, сколько взрослый слон.',
      uz: 'Koʻk kitning tili taxminan katta fil ogʻirligicha keladi.' }),

  q('animals-octopus', 'animals',
    { ru: 'Сколько сердец у осьминога?', uz: 'Sakkizoyoqning nechta yuragi bor?' },
    [
      { ru: 'Три', uz: 'Uchta' },
      { ru: 'Одно', uz: 'Bitta' },
      { ru: 'Пять', uz: 'Beshta' },
    ],
    { ru: 'Два сердца гонят кровь через жабры, третье — по всему телу. А кровь у осьминога голубая.',
      uz: 'Ikki yurak qonni jabralarga, uchinchisi butun tanaga haydaydi. Qoni esa koʻk rangda.' }),

  q('animals-fastest', 'animals',
    { ru: 'Кто самый быстрый на суше?', uz: 'Quruqlikdagi eng tez hayvon qaysi?' },
    [
      { ru: 'Гепард', uz: 'Gepard' },
      { ru: 'Лошадь', uz: 'Ot' },
      { ru: 'Заяц', uz: 'Quyon' },
    ],
    { ru: 'Гепард разгоняется примерно до 110 км/ч, но выдерживает такой бег меньше минуты.',
      uz: 'Gepard 110 km/soatgacha tezlanadi, ammo bunday yugurishga bir daqiqadan kam chidaydi.' }),

  q('animals-chameleon', 'animals',
    { ru: 'Зачем хамелеон меняет цвет?', uz: 'Xameleon nega rangini oʻzgartiradi?' },
    [
      { ru: 'Из-за настроения и температуры', uz: 'Kayfiyati va harorat tufayli' },
      { ru: 'Чтобы точно повторить фон', uz: 'Fonni aniq takrorlash uchun' },
      { ru: 'Чтобы охладить кожу от солнца', uz: 'Terisini quyoshdan sovutish uchun' },
    ],
    { ru: 'Хамелеон не подстраивается под обои: цвет меняется от настроения, света и температуры.',
      uz: 'Xameleon fonga moslashmaydi: rang kayfiyat, yorugʻlik va haroratdan oʻzgaradi.' }),

  q('animals-giraffe', 'animals',
    { ru: 'Сколько шейных позвонков у жирафа?', uz: 'Jirafaning boʻyin umurtqalari nechta?' },
    [
      { ru: 'Семь — как у человека', uz: 'Yettita — odamdagidek' },
      { ru: 'Двадцать', uz: 'Yigirmata' },
      { ru: 'Сорок', uz: 'Qirqta' },
    ],
    { ru: 'Позвонков столько же, сколько у нас, просто каждый вытянут почти на 25 сантиметров.',
      uz: 'Umurtqalar soni bizdagidek, faqat har biri deyarli 25 santimetrga choʻzilgan.' }),

  q('animals-spider', 'animals',
    { ru: 'Сколько ног у паука?', uz: 'Oʻrgimchakning nechta oyogʻi bor?' },
    [
      { ru: 'Восемь', uz: 'Sakkizta' },
      { ru: 'Шесть', uz: 'Oltita' },
      { ru: 'Десять', uz: 'Oʻnta' },
    ],
    { ru: 'Поэтому паук — не насекомое: у насекомых шесть ног, а у пауков восемь.',
      uz: 'Shuning uchun oʻrgimchak hasharot emas: hasharotlarda olti, oʻrgimchaklarda sakkiz oyoq.' }),

  q('animals-bat', 'animals',
    { ru: 'Как летучая мышь находит дорогу в темноте?', uz: 'Koʻrshapalak zulmatda yoʻlni qanday topadi?' },
    [
      { ru: 'По эху своего писка', uz: 'Oʻz ovozining aks-sadosi orqali' },
      { ru: 'По запаху', uz: 'Hid orqali' },
      { ru: 'По свету звёзд', uz: 'Yulduzlar yorugʻligi orqali' },
    ],
    { ru: 'Это эхолокация: мышь кричит и слушает, как звук отражается от предметов.',
      uz: 'Bu exolokatsiya: koʻrshapalak ovoz chiqaradi va uning buyumlardan qaytishini eshitadi.' }),

  q('animals-penguin', 'animals',
    { ru: 'Какая птица не умеет летать?', uz: 'Qaysi qush ucha olmaydi?' },
    [
      { ru: 'Пингвин', uz: 'Pingvin' },
      { ru: 'Голубь', uz: 'Kaptar' },
      { ru: 'Сокол', uz: 'Lochin' },
    ],
    { ru: 'Зато под водой пингвин «летает» — плавает со скоростью до 30 км/ч.',
      uz: 'Buning oʻrniga pingvin suv ostida “uchadi” — 30 km/soatgacha suzadi.' }),

  q('animals-camel', 'animals',
    { ru: 'Что верблюд хранит в горбу?', uz: 'Tuya oʻrkachida nima saqlaydi?' },
    [
      { ru: 'Жир', uz: 'Yogʻ' },
      { ru: 'Воду', uz: 'Suv' },
      { ru: 'Воздух', uz: 'Havo' },
    ],
    { ru: 'Горб — запас жира. Воду верблюд пьёт впрок: за раз может выпить около 100 литров.',
      uz: 'Oʻrkach — yogʻ zaxirasi. Suvni esa tuya bir yoʻla ichadi: bir marta 100 litrga yaqin.' }),

  q('animals-honey', 'animals',
    { ru: 'Кто делает мёд?', uz: 'Asalni kim tayyorlaydi?' },
    [
      { ru: 'Пчёлы', uz: 'Asalarilar' },
      { ru: 'Осы', uz: 'Ari (chayonari)' },
      { ru: 'Шмели-одиночки', uz: 'Yolgʻiz asalarilar' },
    ],
    { ru: 'Чтобы собрать ложку мёда, пчёлы облетают тысячи цветков.',
      uz: 'Bir qoshiq asal uchun asalarilar minglab gulni aylanib chiqadi.' }),
];
