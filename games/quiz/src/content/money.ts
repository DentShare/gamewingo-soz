import { q, type Question } from './types';

/**
 * Деньги — финансовая грамотность.
 *
 * Тема образовательная: объясняем понятия и безопасность. Никаких обещаний
 * доходности, никаких реальных денег и выводов внутри игры (App Store 4.7,
 * железное правило каталога №3).
 */
export const MONEY: Question[] = [
  q('money-sms', 'money',
    { ru: 'Вам звонят из «банка» и просят код из СМС. Что делать?', uz: '“Bank”dan qoʻngʻiroq qilib SMS kodini soʻrashyapti. Nima qilasiz?' },
    [
      { ru: 'Не называть код никому', uz: 'Kodni hech kimga aytmaslik' },
      { ru: 'Назвать, если знают ваше имя', uz: 'Ismingizni bilsa, aytish' },
      { ru: 'Отправить код в сообщении', uz: 'Kodni xabarda yuborish' },
    ],
    { ru: 'Настоящий банк никогда не спрашивает код из СМС, ПИН и CVV — это всегда мошенники.',
      uz: 'Haqiqiy bank hech qachon SMS kodi, PIN va CVV soʻramaydi — bu doim firibgarlar.' }),

  q('money-cashback', 'money',
    { ru: 'Что такое кэшбэк?', uz: 'Keshbek nima?' },
    [
      { ru: 'Возврат части суммы покупки', uz: 'Xarid summasining bir qismini qaytarish' },
      { ru: 'Скидка перед оплатой', uz: 'Toʻlovdan oldingi chegirma' },
      { ru: 'Кредит на покупку', uz: 'Xarid uchun kredit' },
    ],
    { ru: 'Кэшбэк возвращается уже после оплаты, поэтому он не повод покупать ненужное.',
      uz: 'Keshbek toʻlovdan keyin qaytadi, shuning uchun u keraksiz narsa sotib olishga sabab emas.' }),

  q('money-budget', 'money',
    { ru: 'Что такое личный бюджет?', uz: 'Shaxsiy byudjet nima?' },
    [
      { ru: 'План доходов и расходов', uz: 'Daromad va xarajatlar rejasi' },
      { ru: 'Сумма на карте прямо сейчас', uz: 'Hozir kartadagi summa' },
      { ru: 'Долг перед банком', uz: 'Bank oldidagi qarz' },
    ],
    { ru: 'Бюджет отвечает на простой вопрос: сколько пришло, сколько ушло и куда именно.',
      uz: 'Byudjet oddiy savolga javob beradi: qancha kirdi, qancha chiqdi va aynan qayerga.' }),

  q('money-cushion', 'money',
    { ru: 'Что такое «подушка безопасности»?', uz: '“Xavfsizlik yostigʻi” nima?' },
    [
      { ru: 'Запас денег на 3–6 месяцев жизни', uz: '3–6 oylik hayot uchun pul zaxirasi' },
      { ru: 'Страховка автомобиля', uz: 'Avtomobil sugʻurtasi' },
      { ru: 'Кредитная карта про запас', uz: 'Zaxiradagi kredit karta' },
    ],
    { ru: 'Такой запас нужен именно на непредвиденное, а не на отпуск и не на новый телефон.',
      uz: 'Bunday zaxira kutilmagan holatlar uchun kerak, taʼtil yoki yangi telefon uchun emas.' }),

  q('money-inflation', 'money',
    { ru: 'Что такое инфляция?', uz: 'Inflyatsiya nima?' },
    [
      { ru: 'Цены растут, деньги дешевеют', uz: 'Narxlar oshadi, pul qadrsizlanadi' },
      { ru: 'Банк повышает комиссию', uz: 'Bank komissiyani oshiradi' },
      { ru: 'Курс валюты не меняется', uz: 'Valyuta kursi oʻzgarmaydi' },
    ],
    { ru: 'Из-за инфляции деньги «под матрасом» со временем теряют покупательную способность.',
      uz: 'Inflyatsiya tufayli “koʻrpa tagidagi” pul vaqt oʻtishi bilan xarid qobiliyatini yoʻqotadi.' }),

  q('money-lost-card', 'money',
    { ru: 'Что сделать в первую очередь, если потеряли карту?', uz: 'Kartani yoʻqotsangiz, birinchi navbatda nima qilasiz?' },
    [
      { ru: 'Сразу заблокировать её', uz: 'Darhol uni bloklash' },
      { ru: 'Подождать пару дней', uz: 'Bir-ikki kun kutish' },
      { ru: 'Сменить номер телефона', uz: 'Telefon raqamini oʻzgartirish' },
    ],
    { ru: 'Блокировка занимает секунды в приложении и сразу закрывает доступ к деньгам.',
      uz: 'Bloklash ilovada bir necha soniya vaqt oladi va pulga kirishni darhol yopadi.' }),

  q('money-credit', 'money',
    { ru: 'Кредит — это…', uz: 'Kredit — bu…' },
    [
      { ru: 'Деньги в долг, которые возвращают с процентами', uz: 'Foizi bilan qaytariladigan qarz pul' },
      { ru: 'Подарок от банка', uz: 'Bankdan sovgʻa' },
      { ru: 'Ваши собственные накопления', uz: 'Oʻzingizning jamgʻarmangiz' },
    ],
    { ru: 'Полная стоимость кредита всегда больше суммы, которую вы взяли, — на величину процентов.',
      uz: 'Kreditning toʻliq qiymati siz olgan summadan doim koʻproq — foizlar hisobiga.' }),

  q('money-password', 'money',
    { ru: 'Какой пароль надёжнее?', uz: 'Qaysi parol ishonchliroq?' },
    [
      { ru: 'Длинный из случайных слов и знаков', uz: 'Tasodifiy soʻz va belgilardan iborat uzun parol' },
      { ru: 'Дата рождения', uz: 'Tugʻilgan sana' },
      { ru: '1234 — зато не забудешь', uz: '1234 — esdan chiqmaydi' },
    ],
    { ru: 'Длина важнее сложности: короткий пароль подбирается программой за считаные секунды.',
      uz: 'Uzunlik murakkablikdan muhimroq: qisqa parolni dastur bir necha soniyada topadi.' }),

  q('money-goal', 'money',
    { ru: 'Хочется дорогую вещь прямо сейчас. Что разумнее?', uz: 'Qimmat narsa hoziroq kerak. Qaysi biri oqilona?' },
    [
      { ru: 'Накопить на неё по частям', uz: 'Unga boʻlib-boʻlib jamgʻarish' },
      { ru: 'Взять в долг под проценты', uz: 'Foiz evaziga qarz olish' },
      { ru: 'Потратить подушку безопасности', uz: 'Xavfsizlik yostigʻini sarflash' },
    ],
    { ru: 'Правило простое: в долг — за нужным, накопления — за желанным.',
      uz: 'Qoida oddiy: qarz — zarur narsa uchun, jamgʻarma — istalgan narsa uchun.' }),

  q('money-commission', 'money',
    { ru: 'Что такое комиссия?', uz: 'Komissiya nima?' },
    [
      { ru: 'Плата за услугу или перевод', uz: 'Xizmat yoki oʻtkazma uchun toʻlov' },
      { ru: 'Налог на покупку', uz: 'Xariddan olinadigan soliq' },
      { ru: 'Штраф за просрочку', uz: 'Kechikkanlik uchun jarima' },
    ],
    { ru: 'Комиссию всегда видно в условиях до подтверждения — стоит смотреть именно туда.',
      uz: 'Komissiya tasdiqlashdan oldin shartlarda koʻrinadi — aynan oʻsha yerga qarash kerak.' }),
];
