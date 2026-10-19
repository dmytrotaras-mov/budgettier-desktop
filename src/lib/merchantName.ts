// Short, readable merchant names for transaction lists.
//
// Wise descriptions repeat the amount and carry boilerplate, store numbers and
// the city: "Card transaction of 10.35 EUR issued by Rossmann 1519 Berlin".
// This is display-only — the full description stays in the database and is
// shown on hover and in the edit dialog. Descriptions that aren't recognizable
// Wise text (e.g. typed by hand) are returned unchanged.

// Payment-processor prefixes that front many unrelated shops ("Sumup *Tailor").
const PROCESSOR_PREFIXES = new Set(["sumup", "spc", "sp", "ls", "sq", "zettle", "iz", "uzr", "nyx", "paypal", "pp"]);
// Short POS codes that also appear without a "*" ("Ls Akkurat Cafe").
const WORD_PROCESSOR_PREFIXES = new Set(["spc", "sp", "ls", "sq", "iz", "uzr", "nyx"]);

// Prefixes that stand for a well-known brand.
const ALIASES: Record<string, string> = { amzn: "Amazon", amazon: "Amazon", ubr: "Uber", paypal: "PayPal" };

const CITIES = new Set([
  "berlin", "hamburg", "münchen", "munchen", "muenchen", "nchen", "frankfurt", "köln", "koln", "potsdam",
  "schoenefeld", "schönefeld", "essen", "lubeck", "lübeck", "leipzig", "dresden", "milano", "luxembourg",
  "cork", "tallinn", "amsterdam", "kyiv", "chisinau", "london", "paris", "wien", "praha", "prague", "dublin", "warszawa",
]);

// Company-form words; everything from the first one on is dropped.
const LEGAL_FORMS = new Set(["gmbh", "gmb", "se", "ag", "ug", "kg", "ohg", "gbr", "ek", "eg", "vvag", "ltd", "inc", "llc", "bv"]);

// Branch markers left dangling at the end ("Ullrich Fil.", "Supermarket Nr").
const TRAILING_FILLERS = new Set(["nr", "fil", "filiale", "zn", "kst"]);

const isAllCaps = (w: string) => /[A-Z]/.test(w) && w === w.toUpperCase();
const isCity = (w: string) => {
  const lower = w.toLowerCase();
  return CITIES.has(lower) || [...CITIES].some((c) => lower.startsWith(`${c}-`));
};

function cleanMerchant(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return raw;

  // "Sagt Danke" ("says thanks") and everything after it is store marketing.
  text = text.replace(/\s+sagt danke\b.*$/i, "");

  // Processor prefix: "Sumup *Schneiderei", "Uzr*Kiraku", "Zettle_*Victorien".
  const star = text.match(/^([A-Za-z_]+)\s*\*\s*(.+)$/);
  if (star) {
    const prefix = star[1].replace(/[^A-Za-z]/g, "").toLowerCase();
    if (PROCESSOR_PREFIXES.has(prefix)) text = star[2];
    else if (ALIASES[prefix]) return ALIASES[prefix];
    else text = `${star[1]} ${star[2]}`;
  }
  let words = text.replace(/\*/g, " ").split(" ").filter(Boolean);
  while (words.length > 1 && WORD_PROCESSOR_PREFIXES.has(words[0].toLowerCase())) words = words.slice(1);
  if (words.length === 0) return raw;
  const alias = ALIASES[words[0].toLowerCase()];
  if (alias) return alias;

  // A web address as the first word is the brand: "Netflix.com Los Gatos",
  // "Bolt.euo2605…", "Claude.ai Subscription" → "Netflix", "Bolt", "Claude".
  const domain = words[0].match(/^([A-Za-z][A-Za-z-]*)\.[A-Za-z]/);
  if (domain) return domain[1];

  // "Zara-Ber-Tauentzienstr" (brand-City-street) → "Zara".
  const branded = words[0].match(/^([A-Za-z]{2,})-[A-Z][a-z]{2}-/);
  if (branded) words[0] = branded[1];
  // "Platon1" / "Douglas475berlin" → "Platon" / "Douglas".
  if (/\d/.test(words[0]) && /^[A-Za-z]/.test(words[0])) words[0] = words[0].replace(/\d.*$/, "");

  words = words
    .map((w) => w.split("¦")[0].replace(/^(.{3,}?)gmbh(co)?$/i, "$1"))
    .filter((w, i) => i === 0 || (!/\d/.test(w) && !/\.[a-z]{2,}/i.test(w)))
    .filter(Boolean);

  const legalIdx = words.findIndex((w, i) => i > 0 && (LEGAL_FORMS.has(w.toLowerCase()) || /^gmbh/i.test(w)));
  if (legalIdx > 0) words = words.slice(0, legalIdx);

  // A city in the middle starts the branch description: "Kamps Berlin Alexa",
  // "Kaufland Berlin Gesundbru" → "Kamps", "Kaufland". Only when what's left
  // is still a real name ("BB Berlin Facility Management" keeps going).
  const midCity = words.findIndex(
    (w, i) => i > 0 && isCity(w) && words.slice(0, i).some((x) => x.replace(/[^A-Za-z]/g, "").length >= 3),
  );
  if (midCity > 0) words = words.slice(0, midCity);

  // Trailing city, lone letters, dangling punctuation, and ALL-CAPS city
  // codes (only when the name itself isn't written in capitals).
  const nameIsAllCaps = words.every(isAllCaps);
  while (words.length > 1) {
    const last = words[words.length - 1];
    const drop =
      isCity(last) ||
      TRAILING_FILLERS.has(last.replace(/\.$/, "").toLowerCase()) ||
      /^[A-Za-z][-–/&.,*]*$/.test(last) ||
      /^[-–/&.,*]+$/.test(last) ||
      (!nameIsAllCaps && isAllCaps(last) && last.length >= 3 && /^[A-Z]+$/.test(last));
    if (!drop) break;
    words = words.slice(0, -1);
  }
  // "Flix M nchen": Wise drops the "ü" from München.
  if (words.length > 1 && words[words.length - 1] === "M") words = words.slice(0, -1);

  const result = words.join(" ").replace(/[\s\-–/&.,*]+$/, "").trim();
  return result || raw;
}

export function displayMerchantName(description: string | null | undefined): string {
  const d = (description || "").trim();
  if (!d) return "";

  const card = d.match(/^Card transaction of -?[\d.,]+ [A-Z]{3} issued by (.+)$/i);
  if (card) return cleanMerchant(card[1]);

  const paid = d.match(/^Paid to (.+)$/i);
  if (paid) return cleanMerchant(paid[1]);

  const received = d.match(/^Received money from (.+?)(?: with reference .*)?$/i);
  if (received) return cleanMerchant(received[1]);

  const sent = d.match(/^Sent money to (.+?)(?: with reference .*)?$/i);
  if (sent) return cleanMerchant(sent[1]);

  const moved = d.match(/^Moved [\d.,]+ [A-Z]{3} (from|to) (.+)$/i);
  if (moved) return `Moved ${moved[1].toLowerCase()} ${moved[2]}`;

  return d;
}
