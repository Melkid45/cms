// Consultation in the client's language (LV / RU / EN), translated by hand: no AI.
// Questions keep their English options as stored values; only the labels shown change.
import type { Niche } from "./shared";

export const CONSULT_LANGS = ["lv", "ru", "en"] as const;
export type ConsultLang = (typeof CONSULT_LANGS)[number];
export const isConsultLang = (value: unknown): value is ConsultLang =>
  typeof value === "string" && (CONSULT_LANGS as readonly string[]).includes(value);
export const CONSULT_LANG_LABEL: Record<ConsultLang, string> = { lv: "Latviešu", ru: "Русский", en: "English" };

type Q = { text: string; hint?: string };
type Questions = Record<string, Q>;
const OFFER_EN: Record<Niche, string> = {
  cafe: "What is on your menu? List dishes and drinks with prices, one per line — for example “Flat white — €3.90”. Group them by category if you like (Breakfast:, Coffee:…).",
  restaurant: "What is on your menu? List dishes and drinks with prices, one per line, grouped by category if you like (Starters:, Mains:, Desserts:…).",
  beauty: "Which services do you offer and what do they cost? One per line — for example “Men's haircut — €25 — 45 min”.",
  dental: "Which treatments or services do you offer, and their prices (or “from” prices)? One per line.",
  auto: "Which services do you offer (repairs, diagnostics, tyres…) and their prices? One per line.",
  construction: "Which services do you offer (and typical prices or “from” prices if you can share them)? One per line.",
  shop: "Which products or product categories do you sell? One per line, with prices if you want them on the website.",
  studio: "Which services do you offer? One per line, with prices or “from” prices if you want them shown.",
  services: "Which services or products should the website show? One per line, with prices if you want them shown.",
};
const OFFER_LV: Record<Niche, string> = {
  cafe: "Kas ir jūsu ēdienkartē? Uzskaitiet ēdienus un dzērienus ar cenām, katru savā rindā — piemēram, “Flat white — €3.90”. Ja vēlaties, sagrupējiet pa kategorijām (Brokastis:, Kafija:…).",
  restaurant: "Kas ir jūsu ēdienkartē? Uzskaitiet ēdienus un dzērienus ar cenām, katru savā rindā, ja vēlaties — pa kategorijām (Uzkodas:, Pamatēdieni:, Deserti:…).",
  beauty: "Kādus pakalpojumus piedāvājat un cik tie maksā? Katru savā rindā — piemēram, “Vīriešu matu griezums — €25 — 45 min”.",
  dental: "Kādas procedūras vai pakalpojumus piedāvājat un par kādām cenām (vai “no” cenām)? Katru savā rindā.",
  auto: "Kādus pakalpojumus piedāvājat (remonts, diagnostika, riepas…) un par kādām cenām? Katru savā rindā.",
  construction: "Kādus pakalpojumus piedāvājat (un tipiskās vai “no” cenas, ja varat tās norādīt)? Katru savā rindā.",
  shop: "Kādas preces vai preču kategorijas pārdodat? Katru savā rindā, ar cenām, ja vēlaties tās rādīt mājaslapā.",
  studio: "Kādus pakalpojumus piedāvājat? Katru savā rindā, ar cenām vai “no” cenām, ja vēlaties tās rādīt.",
  services: "Kādus pakalpojumus vai preces jārāda mājaslapā? Katru savā rindā, ar cenām, ja vēlaties tās rādīt.",
};
const OFFER_RU: Record<Niche, string> = {
  cafe: "Что у вас в меню? Перечислите блюда и напитки с ценами, каждое с новой строки — например, «Флэт уайт — €3.90». Можно по категориям (Завтраки:, Кофе:…).",
  restaurant: "Что у вас в меню? Перечислите блюда и напитки с ценами, каждое с новой строки, можно по категориям (Закуски:, Горячее:, Десерты:…).",
  beauty: "Какие услуги вы оказываете и сколько они стоят? Каждую с новой строки — например, «Мужская стрижка — €25 — 45 мин».",
  dental: "Какие процедуры или услуги вы предлагаете и по каким ценам (или цены «от»)? Каждую с новой строки.",
  auto: "Какие услуги вы предлагаете (ремонт, диагностика, шины…) и по каким ценам? Каждую с новой строки.",
  construction: "Какие услуги вы предлагаете (и обычные цены или цены «от», если можете их назвать)? Каждую с новой строки.",
  shop: "Какие товары или категории товаров вы продаёте? Каждый с новой строки, с ценами, если хотите показать их на сайте.",
  studio: "Какие услуги вы предлагаете? Каждую с новой строки, с ценами или ценами «от», если хотите их показать.",
  services: "Какие услуги или товары показать на сайте? Каждый с новой строки, с ценами, если хотите их показать.",
};
const QUESTIONS: Record<ConsultLang, Questions> = {
  en: {
    business: {
      text: "Hello! I will ask you a few questions and then build the first version of your website. Let us start: what is your business called, and what do you do?",
      hint: "For example: “Kafejnīca Saule — a small café in Riga old town with breakfast and home-made cakes.”",
    },
    source: {
      text: "Do you already have a website or a social media page (Facebook, Instagram)? Paste the link and I will read it, so you need to type less.",
      hint: "A public link, e.g. https://example.lv. Skip if you have none.",
    },
    "niche:guess": { text: "It sounds like this: {niche}. Is that right? Choose what fits best." },
    niche: { text: "Which of these describes your business best?" },
    offer: { text: "", hint: "Prices you do not want to show yet can stay empty — we will mark them as “to fill in”." },
    audience: {
      text: "Who are your customers? Who do you want to come to you more often?",
      hint: "For example: families with children, office workers nearby, tourists.",
    },
    "unique:food": {
      text: "Why do guests choose you? What do you do differently (recipes, ingredients, atmosphere, the team)?",
      hint: "Only real facts: years in business, awards, numbers. We never invent them.",
    },
    unique: {
      text: "Why do customers choose you over others? Experience, guarantees, speed, prices — anything true about you.",
      hint: "Only real facts: years in business, awards, numbers. We never invent them.",
    },
    competitors: { text: "Are there competitors or websites you like (or do not like)? Paste names or links and say what you like about them." },
    tone: { text: "How should the website speak to visitors?" },
    colors: {
      text: "Do you have brand colours or a logo? Which colours do you like, which should we avoid?",
      hint: "For example: “dark green and cream, no red”. A hex code like #2f5d50 is perfect too.",
    },
    photos: {
      text: "Upload photos you want on the website: the place, the team, your work or products. You can add more later.",
      hint: "JPG, PNG or WebP up to 10 MB each. Skip to use our library photos for now.",
    },
    contacts: { text: "How can customers reach you? Phone, e-mail, address, and links to your social pages.", hint: "One per line." },
    "hours:optional": { text: "Do you have opening hours to show (a showroom, an office)? Skip if not." },
    hours: { text: "What are your opening hours?", hint: "For example: Mon–Fri 8:00–20:00, Sat 9:00–16:00, Sun closed." },
    languages: { text: "In which languages should the website be? The first one you choose is the main language — we write the texts in it, then translate." },
    goal: { text: "What is the main thing a visitor should do on your website?" },
    pages: { text: "Which pages do you need? Home is always included. One page is fine for a start." },
    follow: { text: "", hint: "Skip if you do not know yet." },
  },
  lv: {
    business: {
      text: "Labdien! Uzdošu dažus jautājumus un tad izveidošu jūsu mājaslapas pirmo versiju. Sāksim: kā sauc jūsu uzņēmumu un ar ko tas nodarbojas?",
      hint: "Piemēram: “Kafejnīca Saule — neliela kafejnīca Vecrīgā ar brokastīm un mājas kūkām.”",
    },
    source: {
      text: "Vai jums jau ir mājaslapa vai lapa sociālajos tīklos (Facebook, Instagram)? Ielīmējiet saiti — es to izlasīšu, un jums būs mazāk jāraksta.",
      hint: "Publiska saite, piem., https://example.lv. Ja nav, izlaidiet.",
    },
    "niche:guess": { text: "Izklausās, ka tas ir: {niche}. Vai pareizi? Izvēlieties piemērotāko." },
    niche: { text: "Kas no šī vislabāk raksturo jūsu uzņēmumu?" },
    offer: { text: "", hint: "Cenas, kuras vēl nevēlaties rādīt, var atstāt tukšas — atzīmēsim tās kā “jāaizpilda”." },
    audience: {
      text: "Kas ir jūsu klienti? Kurus jūs vēlētos redzēt biežāk?",
      hint: "Piemēram: ģimenes ar bērniem, tuvējo biroju darbinieki, tūristi.",
    },
    "unique:food": {
      text: "Kāpēc viesi izvēlas jūs? Ko jūs darāt citādi (receptes, produkti, atmosfēra, komanda)?",
      hint: "Tikai patiesi fakti: darbības gadi, apbalvojumi, skaitļi. Mēs tos nekad neizdomājam.",
    },
    unique: {
      text: "Kāpēc klienti izvēlas jūs, nevis citus? Pieredze, garantijas, ātrums, cenas — viss, kas par jums ir patiesi.",
      hint: "Tikai patiesi fakti: darbības gadi, apbalvojumi, skaitļi. Mēs tos nekad neizdomājam.",
    },
    competitors: { text: "Vai ir konkurenti vai mājaslapas, kas jums patīk (vai nepatīk)? Ielīmējiet nosaukumus vai saites un pastāstiet, kas tajās patīk." },
    tone: { text: "Kādā tonī mājaslapai jārunā ar apmeklētājiem?" },
    colors: {
      text: "Vai jums ir zīmola krāsas vai logotips? Kuras krāsas jums patīk un no kurām jāizvairās?",
      hint: "Piemēram: “tumši zaļa un krēmkrāsa, bez sarkanās”. Der arī krāsas kods, piem., #2f5d50.",
    },
    photos: {
      text: "Augšupielādējiet fotogrāfijas, ko vēlaties mājaslapā: telpas, komandu, darbus vai preces. Vēlāk varēsiet pievienot vēl.",
      hint: "JPG, PNG vai WebP līdz 10 MB katra. Ja izlaidīsiet, pagaidām izmantosim mūsu bibliotēkas foto.",
    },
    contacts: { text: "Kā klienti var ar jums sazināties? Tālrunis, e-pasts, adrese un saites uz sociālajiem tīkliem.", hint: "Katru savā rindā." },
    "hours:optional": { text: "Vai jums ir darba laiks, ko rādīt (salons, birojs)? Ja nav, izlaidiet." },
    hours: { text: "Kāds ir jūsu darba laiks?", hint: "Piemēram: P–Pk 8:00–20:00, S 9:00–16:00, Sv slēgts." },
    languages: { text: "Kādās valodās jābūt mājaslapai? Pirmā izvēlētā ir galvenā valoda — tajā rakstām tekstus, pēc tam tulkojam." },
    goal: { text: "Kas ir galvenais, ko apmeklētājam vajadzētu izdarīt jūsu mājaslapā?" },
    pages: { text: "Kādas lapas jums vajag? Sākumlapa ir vienmēr. Sākumam pietiek arī ar vienu lapu." },
    follow: { text: "", hint: "Izlaidiet, ja vēl nezināt." },
  },
  ru: {
    business: {
      text: "Здравствуйте! Я задам несколько вопросов, а потом соберу первую версию вашего сайта. Начнём: как называется ваш бизнес и чем вы занимаетесь?",
      hint: "Например: «Kafejnīca Saule — небольшое кафе в Старой Риге с завтраками и домашней выпечкой».",
    },
    source: {
      text: "У вас уже есть сайт или страница в соцсетях (Facebook, Instagram)? Вставьте ссылку — я её прочитаю, и вам придётся меньше писать.",
      hint: "Публичная ссылка, например https://example.lv. Если нет — пропустите.",
    },
    "niche:guess": { text: "Похоже, это: {niche}. Верно? Выберите, что подходит лучше всего." },
    niche: { text: "Что из этого лучше всего описывает ваш бизнес?" },
    offer: { text: "", hint: "Цены, которые пока не хотите показывать, можно не указывать — мы отметим их как «заполнить»." },
    audience: {
      text: "Кто ваши клиенты? Кого вы хотели бы видеть чаще?",
      hint: "Например: семьи с детьми, сотрудники соседних офисов, туристы.",
    },
    "unique:food": {
      text: "Почему гости выбирают вас? Что вы делаете иначе (рецепты, продукты, атмосфера, команда)?",
      hint: "Только реальные факты: годы работы, награды, цифры. Мы их никогда не придумываем.",
    },
    unique: {
      text: "Почему клиенты выбирают вас, а не других? Опыт, гарантии, скорость, цены — всё, что о вас правда.",
      hint: "Только реальные факты: годы работы, награды, цифры. Мы их никогда не придумываем.",
    },
    competitors: { text: "Есть ли конкуренты или сайты, которые вам нравятся (или не нравятся)? Вставьте названия или ссылки и напишите, что в них нравится." },
    tone: { text: "Как сайт должен говорить с посетителями?" },
    colors: {
      text: "У вас есть фирменные цвета или логотип? Какие цвета вам нравятся, а каких лучше избегать?",
      hint: "Например: «тёмно-зелёный и кремовый, без красного». Подойдёт и код цвета, например #2f5d50.",
    },
    photos: {
      text: "Загрузите фотографии для сайта: помещение, команда, ваши работы или товары. Позже можно добавить ещё.",
      hint: "JPG, PNG или WebP до 10 МБ каждая. Если пропустите, пока возьмём фото из нашей библиотеки.",
    },
    contacts: { text: "Как клиенты могут с вами связаться? Телефон, e-mail, адрес и ссылки на соцсети.", hint: "Каждое с новой строки." },
    "hours:optional": { text: "Есть ли часы работы, которые нужно показать (шоурум, офис)? Если нет — пропустите." },
    hours: { text: "Какие у вас часы работы?", hint: "Например: Пн–Пт 8:00–20:00, Сб 9:00–16:00, Вс выходной." },
    languages: { text: "На каких языках должен быть сайт? Первый выбранный — основной: на нём пишем тексты, потом переводим." },
    goal: { text: "Что главное должен сделать посетитель на вашем сайте?" },
    pages: { text: "Какие страницы вам нужны? Главная есть всегда. Для начала хватит и одной страницы." },
    follow: { text: "", hint: "Пропустите, если пока не знаете." },
  },
};
const OFFERS: Record<ConsultLang, Record<Niche, string>> = { en: OFFER_EN, lv: OFFER_LV, ru: OFFER_RU };

// Labels of options (stored value = the English label).
const LABELS: Record<Exclude<ConsultLang, "en">, Record<string, string>> = {
  lv: {
    "Café / bakery": "Kafejnīca / maiznīca",
    "Restaurant / bar": "Restorāns / bārs",
    "Barber / beauty salon": "Bārddzinis / skaistumkopšanas salons",
    "Dental / medical clinic": "Zobārstniecība / klīnika",
    "Car service / garage": "Autoserviss",
    "Construction / renovation": "Būvniecība / remonts",
    Shop: "Veikals",
    "Design / creative studio": "Dizaina / radošā studija",
    "Other services": "Citi pakalpojumi",
    "Warm and friendly": "Silti un draudzīgi",
    "Calm and professional": "Mierīgi un profesionāli",
    "Premium and elegant": "Prestiži un eleganti",
    "Bold and energetic": "Drosmīgi un enerģiski",
    Playful: "Rotaļīgi",
    Latvian: "Latviešu",
    Russian: "Krievu",
    English: "Angļu",
    German: "Vācu",
    "Book a visit / table online": "Pieteikt vizīti / rezervēt galdiņu",
    "Call or message us": "Piezvanīt vai uzrakstīt",
    "Send an enquiry": "Nosūtīt pieprasījumu",
    "Look at our work": "Apskatīt mūsu darbus",
    "Order a product": "Pasūtīt preci",
    "Visit the shop": "Apmeklēt veikalu",
    "Book a meeting": "Pieteikt tikšanos",
    About: "Par mums",
    Services: "Pakalpojumi",
    Prices: "Cenas",
    Menu: "Ēdienkarte",
    Gallery: "Galerija",
    Reviews: "Atsauksmes",
    FAQ: "BUJ",
    Contacts: "Kontakti",
  },
  ru: {
    "Café / bakery": "Кафе / пекарня",
    "Restaurant / bar": "Ресторан / бар",
    "Barber / beauty salon": "Барбершоп / салон красоты",
    "Dental / medical clinic": "Стоматология / клиника",
    "Car service / garage": "Автосервис",
    "Construction / renovation": "Строительство / ремонт",
    Shop: "Магазин",
    "Design / creative studio": "Дизайн / творческая студия",
    "Other services": "Другие услуги",
    "Warm and friendly": "Тепло и дружелюбно",
    "Calm and professional": "Спокойно и профессионально",
    "Premium and elegant": "Премиально и элегантно",
    "Bold and energetic": "Смело и энергично",
    Playful: "Игриво",
    Latvian: "Латышский",
    Russian: "Русский",
    English: "Английский",
    German: "Немецкий",
    "Book a visit / table online": "Записаться / забронировать столик",
    "Call or message us": "Позвонить или написать",
    "Send an enquiry": "Отправить заявку",
    "Look at our work": "Посмотреть наши работы",
    "Order a product": "Заказать товар",
    "Visit the shop": "Прийти в магазин",
    "Book a meeting": "Записаться на встречу",
    About: "О нас",
    Services: "Услуги",
    Prices: "Цены",
    Menu: "Меню",
    Gallery: "Галерея",
    Reviews: "Отзывы",
    FAQ: "Вопросы",
    Contacts: "Контакты",
  },
};
export const optionLabel = (lang: ConsultLang, value: string) => (lang === "en" ? value : (LABELS[lang][value] ?? value));
export function questionText(lang: ConsultLang, key: string, niche?: Niche, vars: Record<string, string> = {}): Q {
  const q = { ...(QUESTIONS[lang][key] ?? QUESTIONS.en[key] ?? { text: "" }) };
  if (key === "offer") q.text = OFFERS[lang][niche ?? "services"];
  for (const [name, value] of Object.entries(vars)) q.text = q.text.replace(`{${name}}`, value);
  return q;
}

// Assistant messages written by the server during the consultation.
const MESSAGES: Record<ConsultLang, Record<string, string>> = {
  en: {
    "import.found": "I read {pages} page(s) of {host} and found: {found}. I will offer these as answers — confirm or correct them.",
    "import.little": "I opened {host} but found little text to reuse. Let us continue with questions.",
    "brief.ready": "Thank you! Here is your brief. Check it, correct anything, then confirm — I will build the first version of your website.",
    "brief.confirmed": "Brief confirmed. Building your draft website now…",
    skipped: "(skipped)",
    photos: "{n} photos",
  },
  lv: {
    "import.found": "Izlasīju {pages} lapu(-as) no {host} un atradu: {found}. Piedāvāšu to kā atbildes — apstipriniet vai izlabojiet.",
    "import.little": "Atvēru {host}, bet atradu maz teksta, ko izmantot. Turpināsim ar jautājumiem.",
    "brief.ready": "Paldies! Lūk, jūsu tehniskais uzdevums. Pārbaudiet, izlabojiet, ja vajag, un apstipriniet — tad izveidošu mājaslapas pirmo versiju.",
    "brief.confirmed": "Uzdevums apstiprināts. Veidoju mājaslapas melnrakstu…",
    skipped: "(izlaists)",
    photos: "{n} foto",
  },
  ru: {
    "import.found": "Я прочитал {pages} стр. сайта {host} и нашёл: {found}. Предложу это как ответы — подтвердите или исправьте.",
    "import.little": "Я открыл {host}, но нашёл мало текста. Продолжим с вопросами.",
    "brief.ready": "Спасибо! Вот ваше техническое задание. Проверьте, исправьте, если нужно, и подтвердите — я соберу первую версию сайта.",
    "brief.confirmed": "Задание подтверждено. Собираю черновик сайта…",
    skipped: "(пропущено)",
    photos: "{n} фото",
  },
};
const FOUND: Record<ConsultLang, Record<string, string>> = {
  en: { business: "business", offer: "services/products", audience: "customers", unique: "strengths", contacts: "contacts", hours: "opening hours", colors: "colours", images: "images" },
  lv: { business: "uzņēmums", offer: "pakalpojumi/preces", audience: "klienti", unique: "priekšrocības", contacts: "kontakti", hours: "darba laiks", colors: "krāsas", images: "attēli" },
  ru: { business: "бизнес", offer: "услуги/товары", audience: "клиенты", unique: "преимущества", contacts: "контакты", hours: "часы работы", colors: "цвета", images: "изображения" },
};
export function message(lang: ConsultLang, key: string, vars: Record<string, string | number> = {}) {
  let text = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
  return text;
}
export const foundLabel = (lang: ConsultLang, key: string) => FOUND[lang][key] ?? key;

// Interface texts of the consultation and the brief.
const UI = {
  en: {
    Consultation: "Consultation", Draft: "Draft", "Your review": "Your review", Translation: "Translation", Live: "Live",
    "step.consultation": "Tell us about your business — we ask, you answer by text or voice.",
    "step.draft": "We build the first version of your website from your brief.",
    "step.review": "Look through every page and comment on any block — it is rewritten for you.",
    "step.translation": "Approved pages are translated into your other languages.",
    "step.live": "Your website is published.",
    Send: "Send", Skip: "Skip", Continue: "Continue", Voice: "Voice", "Your answer": "Your answer",
    "From your website:": "From your website:", "Use this": "Use this", "Read my website": "Read my website",
    "Add photos": "Add photos", "Write my brief": "Write my brief", "Writing your brief…": "Writing your brief…",
    "Reading your website…": "Reading your website…", "Saving…": "Saving…",
    "all.done": "That is everything I need. I will now put your answers together into a brief.",
    "Language of the consultation": "Language of the consultation",
    "Your brief": "Your brief", "brief.lead": "Everything the website will say comes from here. Correct anything, then confirm.",
    "brief.missing": "Still missing — shown as [placeholders] on the website until you add them:",
    "Business name": "Business name", "Type of business": "Type of business", "About the business": "About the business",
    Customers: "Customers", "Services / products": "Services / products", "offers.hint": "One per line: name | price | description | category",
    "Why customers choose you": "Why customers choose you", "unique.hint": "One per line, only true facts.",
    Tone: "Tone", Colours: "Colours", Phone: "Phone", "E-mail": "E-mail", Address: "Address", "Opening hours": "Opening hours",
    "Social links": "Social links", "social.hint": "One https:// link per line.", "Languages (first = main)": "Languages (first = main)",
    main: "main", Pages: "Pages", "Save changes": "Save changes", "Confirm and build my website": "Confirm and build my website",
    "Building your website… this takes about a minute.": "Building your website… this takes about a minute.",
    voice: "voice",
  },
  lv: {
    Consultation: "Konsultācija", Draft: "Melnraksts", "Your review": "Jūsu pārbaude", Translation: "Tulkošana", Live: "Publicēts",
    "step.consultation": "Pastāstiet par savu uzņēmumu — mēs jautājam, jūs atbildat rakstot vai balsī.",
    "step.draft": "No jūsu uzdevuma veidojam mājaslapas pirmo versiju.",
    "step.review": "Apskatiet katru lapu un komentējiet jebkuru bloku — tas tiks pārrakstīts.",
    "step.translation": "Apstiprinātās lapas tiek tulkotas citās jūsu valodās.",
    "step.live": "Jūsu mājaslapa ir publicēta.",
    Send: "Sūtīt", Skip: "Izlaist", Continue: "Turpināt", Voice: "Balss", "Your answer": "Jūsu atbilde",
    "From your website:": "No jūsu mājaslapas:", "Use this": "Izmantot", "Read my website": "Izlasīt manu mājaslapu",
    "Add photos": "Pievienot foto", "Write my brief": "Sagatavot uzdevumu", "Writing your brief…": "Gatavoju uzdevumu…",
    "Reading your website…": "Lasu jūsu mājaslapu…", "Saving…": "Saglabāju…",
    "all.done": "Tas ir viss, kas man vajadzīgs. Tagad apkopošu jūsu atbildes tehniskajā uzdevumā.",
    "Language of the consultation": "Konsultācijas valoda",
    "Your brief": "Jūsu tehniskais uzdevums", "brief.lead": "Viss, ko teiks mājaslapa, nāk no šejienes. Izlabojiet, ja vajag, un apstipriniet.",
    "brief.missing": "Vēl trūkst — mājaslapā tiks rādīts kā [aizpildāms], līdz pievienosiet:",
    "Business name": "Uzņēmuma nosaukums", "Type of business": "Darbības veids", "About the business": "Par uzņēmumu",
    Customers: "Klienti", "Services / products": "Pakalpojumi / preces", "offers.hint": "Katru savā rindā: nosaukums | cena | apraksts | kategorija",
    "Why customers choose you": "Kāpēc klienti izvēlas jūs", "unique.hint": "Katru savā rindā, tikai patiesi fakti.",
    Tone: "Tonis", Colours: "Krāsas", Phone: "Tālrunis", "E-mail": "E-pasts", Address: "Adrese", "Opening hours": "Darba laiks",
    "Social links": "Sociālo tīklu saites", "social.hint": "Katra https:// saite savā rindā.", "Languages (first = main)": "Valodas (pirmā — galvenā)",
    main: "galvenā", Pages: "Lapas", "Save changes": "Saglabāt", "Confirm and build my website": "Apstiprināt un veidot mājaslapu",
    "Building your website… this takes about a minute.": "Veidoju jūsu mājaslapu… tas aizņem apmēram minūti.",
    voice: "balss",
  },
  ru: {
    Consultation: "Консультация", Draft: "Черновик", "Your review": "Ваша проверка", Translation: "Перевод", Live: "Опубликован",
    "step.consultation": "Расскажите о своём бизнесе — мы спрашиваем, вы отвечаете текстом или голосом.",
    "step.draft": "По вашему заданию собираем первую версию сайта.",
    "step.review": "Посмотрите каждую страницу и прокомментируйте любой блок — его перепишут.",
    "step.translation": "Одобренные страницы переводятся на ваши другие языки.",
    "step.live": "Ваш сайт опубликован.",
    Send: "Отправить", Skip: "Пропустить", Continue: "Дальше", Voice: "Голос", "Your answer": "Ваш ответ",
    "From your website:": "С вашего сайта:", "Use this": "Использовать", "Read my website": "Прочитать мой сайт",
    "Add photos": "Добавить фото", "Write my brief": "Составить задание", "Writing your brief…": "Составляю задание…",
    "Reading your website…": "Читаю ваш сайт…", "Saving…": "Сохраняю…",
    "all.done": "Это всё, что мне нужно. Сейчас соберу ваши ответы в техническое задание.",
    "Language of the consultation": "Язык консультации",
    "Your brief": "Ваше техническое задание", "brief.lead": "Всё, что скажет сайт, берётся отсюда. Исправьте, если нужно, и подтвердите.",
    "brief.missing": "Ещё не хватает — на сайте будет показано как [заполнить], пока не добавите:",
    "Business name": "Название бизнеса", "Type of business": "Вид деятельности", "About the business": "О бизнесе",
    Customers: "Клиенты", "Services / products": "Услуги / товары", "offers.hint": "Каждое с новой строки: название | цена | описание | категория",
    "Why customers choose you": "Почему выбирают вас", "unique.hint": "Каждое с новой строки, только реальные факты.",
    Tone: "Тон", Colours: "Цвета", Phone: "Телефон", "E-mail": "E-mail", Address: "Адрес", "Opening hours": "Часы работы",
    "Social links": "Ссылки на соцсети", "social.hint": "Каждая https:// ссылка с новой строки.", "Languages (first = main)": "Языки (первый — основной)",
    main: "основной", Pages: "Страницы", "Save changes": "Сохранить", "Confirm and build my website": "Подтвердить и собрать сайт",
    "Building your website… this takes about a minute.": "Собираю ваш сайт… это займёт около минуты.",
    voice: "голос",
  },
} satisfies Record<ConsultLang, Record<string, string>>;
export type UiKey = keyof (typeof UI)["en"];
export const ui = (lang: ConsultLang | undefined, key: UiKey) => UI[lang ?? "en"][key] ?? UI.en[key];
// Browser language → consultation language.
export function browserLang(languages: readonly string[]): ConsultLang {
  for (const value of languages) {
    const code = value.slice(0, 2).toLowerCase();
    if (isConsultLang(code)) return code;
  }
  return "en";
}
