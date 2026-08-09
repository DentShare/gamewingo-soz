/**
 * Манифест картинок пазла: что собираем и какую историю читаем после сборки.
 *
 * Слой сменный. Пока `src` не задан, картинку рисует векторная сцена каталога
 * (`src/game/painters.ts`) — так игра работает до прихода купленного набора
 * иллюстраций. Когда набор появится, достаточно положить файл в
 * `public/pictures/<id>.webp` и прописать `src` — резка на кусочки, сборка,
 * лестница и истории не меняются.
 */

export interface Localized {
  ru: string;
  uz: string;
}

export interface Picture {
  /** Идентификатор: он же ключ векторной сцены и имя файла картинки. */
  id: string;
  title: Localized;
  /** Короткая история про то, что изображено. Читается после сборки. */
  story: Localized;
  /**
   * Путь к готовой иллюстрации относительно `public/`. Пока не задан —
   * рисуется векторный плейсхолдер.
   */
  src?: string;
}

export const PICTURES: readonly Picture[] = [
  {
    id: 'sunny-day',
    title: { ru: 'Солнечный день', uz: 'Quyoshli kun' },
    story: {
      ru: 'Солнце проснулось первым и разбудило цветы на холме. Цветы потянулись к небу и раскрыли лепестки. «Какой хороший день!» — сказал самый маленький цветок.',
      uz: 'Quyosh birinchi boʻlib uygʻondi va tepalikdagi gullarni uygʻotdi. Gullar osmonga intilib, barglarini ochdi. “Qanday yaxshi kun!” — dedi eng kichkina gul.',
    },
  },
  {
    id: 'cosy-house',
    title: { ru: 'Домик у дерева', uz: 'Daraxt yonidagi uy' },
    story: {
      ru: 'В этом домике живёт дружная семья. Утром они открывают окно и здороваются с деревом во дворе. А дерево машет им веткой в ответ.',
      uz: 'Bu uyda ahil oila yashaydi. Ertalab ular derazani ochib, hovlidagi daraxt bilan salomlashadi. Daraxt esa javoban shoxini silkitadi.',
    },
  },
  {
    id: 'little-boat',
    title: { ru: 'Кораблик в море', uz: 'Dengizdagi kema' },
    story: {
      ru: 'Кораблик поднял паруса и поплыл навстречу ветру. Волны качали его, будто колыбель. Впереди ждал остров, которого ещё никто не видел.',
      uz: 'Kema yelkanlarini koʻtarib, shamolga qarab suzdi. Toʻlqinlar uni beshikdek tebratdi. Oldinda hali hech kim koʻrmagan orol kutardi.',
    },
  },
  {
    id: 'rocket',
    title: { ru: 'Ракета летит к звёздам', uz: 'Raketa yulduzlarga uchmoqda' },
    story: {
      ru: 'Ракета сосчитала до трёх и взлетела. Звёзды подмигивали ей по дороге, а планета издалека казалась круглой бирюзовой горошиной.',
      uz: 'Raketa uchgacha sanab, koʻtarildi. Yoʻlda yulduzlar unga koʻz qisdi, sayyora esa uzoqdan yumaloq feruza noʻxatdek koʻrindi.',
    },
  },
  {
    id: 'apple-tree',
    title: { ru: 'Яблоня', uz: 'Olma daraxti' },
    story: {
      ru: 'Всё лето яблоня качала яблоки на ветках. Осенью самые спелые сами спрыгнули в траву. Их хватило и людям, и ежу, и птицам.',
      uz: 'Yoz boʻyi olma daraxti shoxlarida olmalarni tebratdi. Kuzda eng pishganlari oʻzi oʻt ustiga sakradi. Ular odamlarga ham, kirpiga ham, qushlarga ham yetdi.',
    },
  },
  {
    id: 'kitten',
    title: { ru: 'Рыжий котёнок', uz: 'Malla mushukcha' },
    story: {
      ru: 'Котёнок целый день гонялся за солнечным зайчиком. Поймать его так и не вышло, зато нашлось тёплое место на подоконнике. Там он и уснул.',
      uz: 'Mushukcha kun boʻyi quyosh nurchasini quvladi. Uni tuta olmadi, ammo derazada issiq joy topdi. Oʻsha yerda uxlab qoldi.',
    },
  },
  {
    id: 'aquarium',
    title: { ru: 'Рыбки в аквариуме', uz: 'Akvariumdagi baliqlar' },
    story: {
      ru: 'Две рыбки живут среди зелёных водорослей. Одна любит плавать наверху, где светло, другая — у самого дна, где прячутся камешки.',
      uz: 'Ikki baliqcha yashil suvoʻtlar orasida yashaydi. Biri yorugʻ yuqorida suzishni yoqtiradi, ikkinchisi esa toshchalar yashiringan tubda.',
    },
  },
  {
    id: 'train',
    title: { ru: 'Весёлый поезд', uz: 'Quvnoq poyezd' },
    story: {
      ru: 'Поезд бежит по рельсам и весело гудит. В первом вагоне едут школьники, во втором — целая корзина яблок. Все спешат в гости.',
      uz: 'Poyezd relslar boʻylab yuguradi va quvnoq gudok chaladi. Birinchi vagonda oʻquvchilar, ikkinchisida bir savat olma. Hammasi mehmonga shoshmoqda.',
    },
  },
  {
    id: 'butterfly',
    title: { ru: 'Бабочка на лугу', uz: 'Oʻtloqdagi kapalak' },
    story: {
      ru: 'Бабочка облетела весь луг и присела отдохнуть. Её крылья такие лёгкие, что ветер носит её сам. А раньше она была маленькой гусеницей.',
      uz: 'Kapalak butun oʻtloqni aylanib chiqdi va dam olish uchun qoʻndi. Qanotlari shu qadar yengilki, shamol uni oʻzi olib yuradi. Ilgari u kichkina qurt edi.',
    },
  },
  {
    id: 'snowman',
    title: { ru: 'Снеговик', uz: 'Qorbobo' },
    story: {
      ru: 'Дети слепили снеговика из трёх снежных комов. Ведро стало шляпой, морковка — носом, а веточки — руками. Снеговик остался сторожить двор.',
      uz: 'Bolalar uchta qor gʻujumidan qorbobo yasashdi. Chelak — shlyapa, sabzi — burun, novdalar esa qoʻl boʻldi. Qorbobo hovlini qoʻriqlab qoldi.',
    },
  },
  {
    id: 'balloon',
    title: { ru: 'Воздушный шар', uz: 'Havo shari' },
    story: {
      ru: 'Шар поднялся выше облаков. Сверху дома стали крошечными, как кубики, а река — тонкой ниточкой. Лететь было совсем не страшно.',
      uz: 'Shar bulutlardan ham balandga koʻtarildi. Tepadan uylar kubikdek kichkina, daryo esa ingichka ipdek koʻrindi. Uchish mutlaqo qoʻrqinchli emas edi.',
    },
  },
  {
    id: 'bee-meadow',
    title: { ru: 'Пчёлка и цветы', uz: 'Asalari va gullar' },
    story: {
      ru: 'Пчёлка облетает цветок за цветком и собирает нектар. Из него получится мёд. Чтобы вышла всего одна ложка, нужно облететь тысячи цветов.',
      uz: 'Asalari guldan gulga qoʻnib, nektar yigʻadi. Undan asal chiqadi. Atigi bir qoshiq asal uchun minglab gulni aylanib chiqish kerak.',
    },
  },
  {
    id: 'little-car',
    title: { ru: 'Машинка на дороге', uz: 'Yoʻldagi mashina' },
    story: {
      ru: 'Красная машинка едет по дороге и не спешит. Она пропускает пешеходов, останавливается на светофоре и всегда доезжает вовремя.',
      uz: 'Qizil mashina yoʻlda ketmoqda, shoshmaydi. U piyodalarni oʻtkazadi, svetoforda toʻxtaydi va doim oʻz vaqtida yetib boradi.',
    },
  },
  {
    id: 'rainbow',
    title: { ru: 'Радуга после дождя', uz: 'Yomgʻirdan keyingi kamalak' },
    story: {
      ru: 'Дождь закончился, и на небе выросла радуга. Она появляется, когда солнце светит сквозь капли. Семь полос — и все разного цвета.',
      uz: 'Yomgʻir tugadi va osmonda kamalak paydo boʻldi. U quyosh tomchilar orasidan nur sochganda chiqadi. Yetti yoʻl — hammasi turli rangda.',
    },
  },
  {
    id: 'good-night',
    title: { ru: 'Спокойной ночи', uz: 'Xayrli tun' },
    story: {
      ru: 'В домике погас свет, только одно окно ещё светится. Луна вышла на дежурство, звёзды заняли свои места. Пора спать — завтра будет новый день.',
      uz: 'Uyda chiroqlar oʻchdi, faqat bitta deraza yonib turibdi. Oy navbatchilikka chiqdi, yulduzlar oʻz oʻrnini egalladi. Uxlash vaqti — ertaga yangi kun.',
    },
  },
];

export const PICTURE_COUNT = PICTURES.length;

/** Картинка по id; для неизвестного id возвращается первая — игра не должна падать. */
export function pictureById(id: string): Picture {
  return PICTURES.find((p) => p.id === id) ?? PICTURES[0];
}
