import { q, type Question } from './types';

/** Наука и техника. Первый вариант в каждом вопросе — верный. */
export const SCIENCE: Question[] = [
  q('sci-kilogram', 'science',
    { ru: 'Что тяжелее: килограмм ваты или килограмм железа?', uz: 'Qaysi biri ogʻir: bir kilogramm paxtami yoki bir kilogramm temirmi?' },
    [
      { ru: 'Весят одинаково', uz: 'Ikkalasi teng' },
      { ru: 'Железо', uz: 'Temir' },
      { ru: 'Вата', uz: 'Paxta' },
    ],
    { ru: 'Килограмм есть килограмм. Разной будет не масса, а объём: вата займёт куда больше места.',
      uz: 'Kilogramm — kilogramm. Farq massada emas, hajmda: paxta ancha koʻp joy egallaydi.' }),

  q('sci-freeze', 'science',
    { ru: 'При какой температуре замерзает чистая вода?', uz: 'Toza suv necha gradusda muzlaydi?' },
    [
      { ru: 'При 0 °C', uz: '0 °C da' },
      { ru: 'При −10 °C', uz: '−10 °C da' },
      { ru: 'При +4 °C', uz: '+4 °C da' },
    ],
    { ru: 'Солёная вода замерзает ниже нуля — поэтому зимой дороги посыпают солью.',
      uz: 'Sho‘r suv noldan pastda muzlaydi — shuning uchun qishda yoʻllarga tuz sepiladi.' }),

  q('sci-conductor', 'science',
    { ru: 'Что из этого проводит электричество?', uz: 'Bulardan qaysi biri elektr oʻtkazadi?' },
    [
      { ru: 'Медь', uz: 'Mis' },
      { ru: 'Резина', uz: 'Rezina' },
      { ru: 'Сухое дерево', uz: 'Quruq yogʻoch' },
    ],
    { ru: 'Поэтому провода делают из меди, а изоляцию вокруг них — из резины или пластика.',
      uz: 'Shuning uchun simlar misdan, ular atrofidagi izolyatsiya esa rezina yoki plastikdan qilinadi.' }),

  q('sci-sky', 'science',
    { ru: 'Почему небо голубое?', uz: 'Nega osmon koʻk?' },
    [
      { ru: 'Воздух сильнее рассеивает синий свет', uz: 'Havo koʻk nurni kuchliroq sochadi' },
      { ru: 'Небо отражает океан', uz: 'Osmon okeanni aks ettiradi' },
      { ru: 'Воздух сам по себе синий', uz: 'Havoning oʻzi koʻk rangda' },
    ],
    { ru: 'На закате свет идёт через толщу воздуха дольше, синий теряется — и небо краснеет.',
      uz: 'Quyosh botganda nur havo qatlamidan uzoqroq oʻtadi, koʻk rang yoʻqoladi — osmon qizaradi.' }),

  q('sci-water', 'science',
    { ru: 'Из чего состоит вода?', uz: 'Suv nimadan tashkil topgan?' },
    [
      { ru: 'Из водорода и кислорода', uz: 'Vodorod va kisloroddan' },
      { ru: 'Из азота и кислорода', uz: 'Azot va kisloroddan' },
      { ru: 'Из углерода и водорода', uz: 'Uglerod va vodoroddan' },
    ],
    { ru: 'Формула H₂O значит: на каждый атом кислорода приходится два атома водорода.',
      uz: 'H₂O formulasi: har bir kislorod atomiga ikkita vodorod atomi toʻgʻri keladi.' }),

  q('sci-magnet', 'science',
    { ru: 'Какой металл притягивает магнит?', uz: 'Magnit qaysi metallni tortadi?' },
    [
      { ru: 'Железо', uz: 'Temirni' },
      { ru: 'Алюминий', uz: 'Alyuminiyni' },
      { ru: 'Медь', uz: 'Misni' },
    ],
    { ru: 'Земля — тоже огромный магнит, поэтому стрелка компаса всегда смотрит на север.',
      uz: 'Yer ham ulkan magnit, shuning uchun kompas migʻi doim shimolga qaraydi.' }),

  q('sci-lightning', 'science',
    { ru: 'Что такое молния?', uz: 'Chaqmoq nima?' },
    [
      { ru: 'Огромный электрический разряд', uz: 'Ulkan elektr razryadi' },
      { ru: 'Горящий газ в облаке', uz: 'Bulutdagi yonayotgan gaz' },
      { ru: 'Отражение солнца во льду', uz: 'Quyoshning muzdagi aksi' },
    ],
    { ru: 'Гром — это звук от воздуха, который молния мгновенно раскалила и расширила.',
      uz: 'Momaqaldiroq — chaqmoq bir zumda qizdirib kengaytirgan havoning ovozi.' }),

  q('sci-float', 'science',
    { ru: 'Почему масло плавает на воде?', uz: 'Nega yogʻ suv yuzasida qalqib turadi?' },
    [
      { ru: 'Оно легче воды', uz: 'U suvdan yengil' },
      { ru: 'Оно теплее воды', uz: 'U suvdan issiq' },
      { ru: 'Вода его отталкивает магнитом', uz: 'Suv uni magnit bilan itaradi' },
    ],
    { ru: 'Плотность масла меньше, поэтому оно всплывает — как деревяшка в реке.',
      uz: 'Yogʻning zichligi kamroq, shuning uchun u qalqib chiqadi — daryodagi yogʻoch kabi.' }),

  q('sci-microscope', 'science',
    { ru: 'Каким прибором рассматривают бактерии?', uz: 'Bakteriyalar qaysi asbob orqali koʻriladi?' },
    [
      { ru: 'Микроскопом', uz: 'Mikroskop bilan' },
      { ru: 'Телескопом', uz: 'Teleskop bilan' },
      { ru: 'Барометром', uz: 'Barometr bilan' },
    ],
    { ru: 'Телескоп смотрит вдаль, микроскоп — вглубь малого: у них противоположные задачи.',
      uz: 'Teleskop uzoqqa, mikroskop esa mayda narsalarga qaraydi: vazifalari qarama-qarshi.' }),

  q('sci-rainbow', 'science',
    { ru: 'Откуда берётся радуга?', uz: 'Kamalak qayerdan paydo boʻladi?' },
    [
      { ru: 'Капли воды разлагают солнечный свет', uz: 'Suv tomchilari quyosh nurini ajratadi' },
      { ru: 'Облака окрашиваются от ветра', uz: 'Bulutlar shamoldan rang oladi' },
      { ru: 'Солнце меняет цвет после дождя', uz: 'Yomgʻirdan keyin quyosh rangini oʻzgartiradi' },
    ],
    { ru: 'Белый свет только кажется бесцветным: в каплях он раскладывается на все цвета сразу.',
      uz: 'Oq nur faqat rangsizdek koʻrinadi: tomchilarda u barcha ranglarga ajraladi.' }),
];
