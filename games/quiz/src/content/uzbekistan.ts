import { q, type Question } from './types';

/** Узбекистан. Первый вариант в каждом вопросе — верный. */
export const UZBEKISTAN: Question[] = [
  q('uz-capital', 'uzbekistan',
    { ru: 'Столица Узбекистана?', uz: 'Oʻzbekiston poytaxti qaysi shahar?' },
    [
      { ru: 'Ташкент', uz: 'Toshkent' },
      { ru: 'Самарканд', uz: 'Samarqand' },
      { ru: 'Бухара', uz: 'Buxoro' },
    ],
    { ru: 'Название города переводится как «каменный город».',
      uz: 'Shahar nomi “tosh shahar” degan maʼnoni bildiradi.' }),

  q('uz-registan', 'uzbekistan',
    { ru: 'В каком городе находится площадь Регистан?', uz: 'Registon maydoni qaysi shaharda?' },
    [
      { ru: 'Самарканд', uz: 'Samarqand' },
      { ru: 'Хива', uz: 'Xiva' },
      { ru: 'Наманган', uz: 'Namangan' },
    ],
    { ru: 'Три медресе Регистана строили больше двухсот лет — с XV по XVII век.',
      uz: 'Registondagi uchta madrasa ikki yuz yildan ortiq — XV asrdan XVII asrgacha qurilgan.' }),

  q('uz-khorezmi', 'uzbekistan',
    { ru: 'Чьё имя дало миру слово «алгоритм»?', uz: '“Algoritm” soʻzi kimning nomidan kelib chiqqan?' },
    [
      { ru: 'Аль-Хорезми', uz: 'Al-Xorazmiy' },
      { ru: 'Авиценна', uz: 'Ibn Sino' },
      { ru: 'Улугбек', uz: 'Ulugʻbek' },
    ],
    { ru: 'Учёный из Хорезма написал труд, от названия которого произошло и слово «алгебра».',
      uz: 'Xorazmlik olim asar yozgan, uning nomidan “algebra” soʻzi ham kelib chiqqan.' }),

  q('uz-plov', 'uzbekistan',
    { ru: 'Какое блюдо ЮНЕСКО внесла в список наследия Узбекистана?', uz: 'YUNESKO Oʻzbekiston merosi roʻyxatiga qaysi taomni kiritgan?' },
    [
      { ru: 'Плов', uz: 'Palov' },
      { ru: 'Шашлык', uz: 'Kabob' },
      { ru: 'Лагман', uz: 'Lagʻmon' },
    ],
    { ru: 'Плов вошёл в список нематериального культурного наследия в 2016 году.',
      uz: 'Palov 2016-yilda nomoddiy madaniy meros roʻyxatiga kirgan.' }),

  q('uz-ichankala', 'uzbekistan',
    { ru: 'В каком городе находится крепость Ичан-Кала?', uz: 'Ichan qalʼa qaysi shaharda joylashgan?' },
    [
      { ru: 'Хива', uz: 'Xiva' },
      { ru: 'Термез', uz: 'Termiz' },
      { ru: 'Фергана', uz: 'Fargʻona' },
    ],
    { ru: 'Ичан-Кала — первый объект Узбекистана, попавший в список ЮНЕСКО, ещё в 1990 году.',
      uz: 'Ichan qalʼa — Oʻzbekistonning YUNESKO roʻyxatiga kirgan birinchi obidasi, 1990-yilda.' }),

  q('uz-amudarya', 'uzbekistan',
    { ru: 'Какая река самая длинная в Средней Азии?', uz: 'Oʻrta Osiyodagi eng uzun daryo qaysi?' },
    [
      { ru: 'Амударья', uz: 'Amudaryo' },
      { ru: 'Сырдарья', uz: 'Sirdaryo' },
      { ru: 'Зарафшан', uz: 'Zarafshon' },
    ],
    { ru: 'Амударья начинается в горах Памира и когда-то полноводно впадала в Аральское море.',
      uz: 'Amudaryo Pomir togʻlaridan boshlanadi va bir vaqtlar Orol dengiziga toʻlib quyilardi.' }),

  q('uz-navoi', 'uzbekistan',
    { ru: 'Кто такой Алишер Навои?', uz: 'Alisher Navoiy kim?' },
    [
      { ru: 'Поэт и основоположник узбекской литературы', uz: 'Shoir va oʻzbek adabiyoti asoschisi' },
      { ru: 'Астроном и правитель', uz: 'Astronom va hukmdor' },
      { ru: 'Путешественник и картограф', uz: 'Sayyoh va kartograf' },
    ],
    { ru: 'Он доказал, что на родном тюркском языке можно писать так же тонко, как на персидском.',
      uz: 'U ona turkiy tilida ham fors tilidagidek nozik yozish mumkinligini isbotladi.' }),

  q('uz-ulugbek', 'uzbekistan',
    { ru: 'Чем прославился Улугбек?', uz: 'Ulugʻbek nima bilan mashhur?' },
    [
      { ru: 'Обсерваторией и звёздным каталогом', uz: 'Rasadxonasi va yulduzlar jadvali bilan' },
      { ru: 'Морскими походами', uz: 'Dengiz safarlari bilan' },
      { ru: 'Изобретением бумаги', uz: 'Qogʻoz ixtirosi bilan' },
    ],
    { ru: 'Его каталог из более чем тысячи звёзд веками оставался самым точным в мире.',
      uz: 'Uning mingdan ortiq yulduz jadvali asrlar davomida dunyodagi eng aniq jadval boʻlib qoldi.' }),

  q('uz-silkroad', 'uzbekistan',
    { ru: 'Что связывало Самарканд и Бухару с Китаем и Европой?', uz: 'Samarqand va Buxoroni Xitoy hamda Yevropa bilan nima bogʻlagan?' },
    [
      { ru: 'Великий шёлковый путь', uz: 'Buyuk ipak yoʻli' },
      { ru: 'Морской путь', uz: 'Dengiz yoʻli' },
      { ru: 'Северный тракт', uz: 'Shimoliy trakt' },
    ],
    { ru: 'По этому пути везли не только шёлк, но и бумагу, специи и знания.',
      uz: 'Bu yoʻldan faqat ipak emas, qogʻoz, ziravor va bilim ham olib oʻtilgan.' }),

  q('uz-suzane', 'uzbekistan',
    { ru: 'Что такое сюзане?', uz: 'Soʻzana nima?' },
    [
      { ru: 'Вышитое панно ручной работы', uz: 'Qoʻlda tikilgan kashtali gilam-panno' },
      { ru: 'Праздничный плов', uz: 'Bayram palovi' },
      { ru: 'Народный струнный инструмент', uz: 'Xalq torli asbobi' },
    ],
    { ru: 'Слово происходит от «сузан» — «игла». Такое панно веками готовили девушке в приданое.',
      uz: 'Soʻz “suzan” — “igna” soʻzidan kelib chiqqan. Bunday panno asrlar davomida qizga sep sifatida tayyorlangan.' }),
];
