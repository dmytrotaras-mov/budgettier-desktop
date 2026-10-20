// Searchable emoji for category and group icons, grouped by theme. Keywords
// make search work for words people actually type ("coffee", "rent", "gym").
// Any other emoji can still be entered from the macOS Character Viewer.

export interface EmojiGroup {
  name: string;
  items: [emoji: string, keywords: string][];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: "Home",
    items: [
      ["🏠", "home house rent"], ["🏡", "home house garden"], ["🏢", "office building apartment"], ["🏘️", "houses neighborhood"],
      ["🛋️", "sofa furniture home goods"], ["🛏️", "bed furniture"], ["🪑", "chair furniture"], ["🧴", "lotion home supplies"],
      ["🧻", "toilet paper supplies"], ["🧽", "sponge cleaning"], ["🧹", "broom cleaning"], ["🧺", "basket laundry"],
      ["🪣", "bucket cleaning"], ["🔑", "key keys rent"], ["🔧", "wrench repair maintenance"], ["🔨", "hammer repair"],
      ["🪴", "plant home"], ["🚿", "shower water utilities"], ["🛁", "bath"], ["🪟", "window"],
    ],
  },
  {
    name: "Utilities",
    items: [
      ["⚡", "electricity power energy"], ["💡", "light bulb electricity"], ["🔥", "fire gas heating"], ["💧", "water drop"],
      ["📶", "internet wifi signal"], ["📱", "phone mobile"], ["☎️", "telephone landline"], ["📺", "tv television radio"],
      ["📻", "radio"], ["🛜", "wifi router internet"], ["🔌", "plug power"], ["🌡️", "heating thermometer"],
    ],
  },
  {
    name: "Food & drinks",
    items: [
      ["🛒", "groceries shopping cart supermarket"], ["🥦", "vegetables groceries"], ["🍎", "apple fruit"], ["🥖", "bread bakery"],
      ["🧀", "cheese"], ["🥩", "meat butcher"], ["🍳", "cooking breakfast"], ["☕", "coffee cafe"],
      ["🍵", "tea"], ["🧋", "bubble tea"], ["🍺", "beer bar"], ["🍷", "wine"],
      ["🍸", "cocktail bar"], ["🍽️", "restaurant dining food"], ["🍕", "pizza"], ["🍔", "burger fast food"],
      ["🍣", "sushi"], ["🍜", "noodles ramen pho"], ["🥗", "salad healthy"], ["🍰", "cake dessert"],
      ["🍦", "ice cream"], ["🥐", "croissant bakery"], ["🛵", "delivery scooter food delivery"], ["🥡", "takeaway"],
    ],
  },
  {
    name: "Transport",
    items: [
      ["🚗", "car taxi"], ["🚕", "taxi cab uber"], ["🚌", "bus public transport"], ["🚇", "metro subway u-bahn"],
      ["🚆", "train rail db"], ["🚊", "tram"], ["✈️", "flight plane travel"], ["🛴", "scooter"],
      ["🚲", "bike bicycle"], ["⛽", "fuel gas petrol"], ["🅿️", "parking"], ["🚙", "suv car"],
      ["🛞", "tire wheel car maintenance"], ["🚢", "ship ferry"], ["🗺️", "map trip"], ["🧳", "luggage travel"],
    ],
  },
  {
    name: "Health",
    items: [
      ["🏥", "hospital health insurance"], ["💊", "medicine pills pharmacy"], ["🩺", "doctor stethoscope"], ["👩‍⚕️", "doctor"],
      ["🦷", "dentist tooth"], ["👓", "glasses optician"], ["💪", "gym fitness muscle"], ["🏋️", "gym weights"],
      ["🧘", "yoga wellness meditation"], ["🏃", "running sport"], ["🚴", "cycling sport"], ["🏊", "swimming pool"],
      ["💆", "massage spa"], ["💇", "haircut hairdresser"], ["💅", "nails beauty"], ["🧠", "mental health therapy"],
    ],
  },
  {
    name: "Shopping",
    items: [
      ["🛍️", "shopping bags"], ["👕", "clothes shirt"], ["👗", "dress clothes"], ["👖", "jeans clothes"],
      ["👟", "shoes sneakers"], ["👠", "heels shoes"], ["👜", "bag handbag"], ["🕶️", "sunglasses"],
      ["💄", "makeup cosmetics"], ["💍", "jewelry ring"], ["⌚", "watch"], ["💻", "laptop electronics computer"],
      ["🖥️", "computer desktop"], ["🎧", "headphones audio"], ["📷", "camera photos"], ["🎮", "games console"],
      ["📦", "package parcel amazon"], ["🎁", "gift present"], ["🧸", "toys kids"], ["🖊️", "stationery pen"],
    ],
  },
  {
    name: "Fun",
    items: [
      ["🎬", "cinema movies film"], ["🎭", "theatre"], ["🎨", "art hobbies painting"], ["🎵", "music"],
      ["🎸", "guitar music"], ["🎤", "concert karaoke"], ["🎟️", "tickets events"], ["🏛️", "museum"],
      ["📚", "books reading"], ["🎲", "board games"], ["⚽", "football sport"], ["🎾", "tennis"],
      ["🏖️", "beach vacation holiday"], ["🏕️", "camping"], ["🎉", "party celebration"], ["🔁", "subscriptions recurring"],
      ["📸", "photos photography"], ["🎯", "goal darts"], ["🧩", "puzzle"], ["🎳", "bowling"],
    ],
  },
  {
    name: "Money & work",
    items: [
      ["💰", "money bag salary"], ["💵", "cash dollar income"], ["💶", "euro cash"], ["💳", "card credit loans"],
      ["🏦", "bank fees"], ["📈", "investments stocks growth"], ["📊", "chart stats"], ["🪙", "coin"],
      ["🧾", "receipt bills taxes"], ["📄", "document bills"], ["🛡️", "insurance shield"], ["💼", "work business briefcase"],
      ["🧑‍💻", "freelance developer"], ["🏢", "business company"], ["📝", "notes admin"], ["✉️", "mail post"],
      ["🤝", "deal partnership"], ["💸", "spending money flying"], ["🐷", "savings piggy bank"], ["🎓", "education school university"],
    ],
  },
  {
    name: "People & life",
    items: [
      ["👩", "woman partner"], ["👨", "man"], ["👶", "baby kids"], ["👧", "girl kids"],
      ["👪", "family"], ["❤️", "love heart"], ["🌸", "flower blossom"], ["💐", "flowers bouquet"],
      ["🐶", "dog pet"], ["🐱", "cat pet"], ["🐾", "pet paws"], ["🙏", "charity donation"],
      ["⛪", "church"], ["🎂", "birthday"], ["💒", "wedding"], ["🌍", "world travel"],
    ],
  },
  {
    name: "Symbols",
    items: [
      ["⭐", "star"], ["✨", "sparkles"], ["🔖", "tag bookmark"], ["📌", "pin"],
      ["📋", "clipboard misc"], ["📁", "folder"], ["📂", "folder open group"], ["🗂️", "dividers"],
      ["🏷️", "label tag"], ["⚙️", "settings gear"], ["❓", "unknown question"], ["♻️", "recycle"],
      ["🔒", "lock"], ["🔔", "bell"], ["⏰", "alarm"], ["📅", "calendar"],
    ],
  },
];

/** First grapheme of a string — the emoji someone typed or pasted. */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const Seg = (Intl as any).Segmenter;
  if (Seg) {
    const it = new Seg(undefined, { granularity: "grapheme" }).segment(trimmed)[Symbol.iterator]();
    return it.next().value?.segment ?? "";
  }
  return Array.from(trimmed)[0] ?? "";
}
