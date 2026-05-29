// TIM-1101: ISO 4217 currency catalog + locale-aware formatters.
//
// The Financial Planner used to be USD-locked. The board wanted "anyone,
// anywhere in the world", so the full ISO 4217 active list is enumerated
// here. Formatting is delegated to Intl.NumberFormat with a per-code locale
// hint so symbols (€, £, ¥…), decimal/thousands separators, and "fraction
// digits" all follow the selected currency.
//
// Storage convention: financial inputs are still stored in *minor units*
// (a.k.a. "cents") — for currencies with 0 fraction digits (JPY, KRW…) the
// minor-unit value equals the whole-unit value. formatMinorUnits() handles
// the divisor lookup so callers don't have to.

export interface CurrencyMeta {
  code: string;         // ISO 4217 alpha code (e.g., "USD")
  name: string;         // Display name (e.g., "US Dollar")
  locale: string;       // BCP-47 locale hint for Intl.NumberFormat
  fractionDigits: number; // ISO 4217 minor-unit exponent (0, 2, or 3)
}

// ISO 4217 active currency list. Kept alphabetical by code so the dropdown
// can render in code order. `locale` is a best-effort symbol-friendly hint;
// `fractionDigits` follows the ISO 4217 exponent.
export const CURRENCIES: CurrencyMeta[] = [
  { code: "AED", name: "UAE Dirham", locale: "ar-AE", fractionDigits: 2 },
  { code: "AFN", name: "Afghan Afghani", locale: "ps-AF", fractionDigits: 2 },
  { code: "ALL", name: "Albanian Lek", locale: "sq-AL", fractionDigits: 2 },
  { code: "AMD", name: "Armenian Dram", locale: "hy-AM", fractionDigits: 2 },
  { code: "ANG", name: "Netherlands Antillean Guilder", locale: "nl-CW", fractionDigits: 2 },
  { code: "AOA", name: "Angolan Kwanza", locale: "pt-AO", fractionDigits: 2 },
  { code: "ARS", name: "Argentine Peso", locale: "es-AR", fractionDigits: 2 },
  { code: "AUD", name: "Australian Dollar", locale: "en-AU", fractionDigits: 2 },
  { code: "AWG", name: "Aruban Florin", locale: "nl-AW", fractionDigits: 2 },
  { code: "AZN", name: "Azerbaijani Manat", locale: "az-AZ", fractionDigits: 2 },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", locale: "bs-BA", fractionDigits: 2 },
  { code: "BBD", name: "Barbadian Dollar", locale: "en-BB", fractionDigits: 2 },
  { code: "BDT", name: "Bangladeshi Taka", locale: "bn-BD", fractionDigits: 2 },
  { code: "BGN", name: "Bulgarian Lev", locale: "bg-BG", fractionDigits: 2 },
  { code: "BHD", name: "Bahraini Dinar", locale: "ar-BH", fractionDigits: 3 },
  { code: "BIF", name: "Burundian Franc", locale: "fr-BI", fractionDigits: 0 },
  { code: "BMD", name: "Bermudan Dollar", locale: "en-BM", fractionDigits: 2 },
  { code: "BND", name: "Brunei Dollar", locale: "ms-BN", fractionDigits: 2 },
  { code: "BOB", name: "Bolivian Boliviano", locale: "es-BO", fractionDigits: 2 },
  { code: "BRL", name: "Brazilian Real", locale: "pt-BR", fractionDigits: 2 },
  { code: "BSD", name: "Bahamian Dollar", locale: "en-BS", fractionDigits: 2 },
  { code: "BTN", name: "Bhutanese Ngultrum", locale: "dz-BT", fractionDigits: 2 },
  { code: "BWP", name: "Botswanan Pula", locale: "en-BW", fractionDigits: 2 },
  { code: "BYN", name: "Belarusian Ruble", locale: "be-BY", fractionDigits: 2 },
  { code: "BZD", name: "Belize Dollar", locale: "en-BZ", fractionDigits: 2 },
  { code: "CAD", name: "Canadian Dollar", locale: "en-CA", fractionDigits: 2 },
  { code: "CDF", name: "Congolese Franc", locale: "fr-CD", fractionDigits: 2 },
  { code: "CHF", name: "Swiss Franc", locale: "de-CH", fractionDigits: 2 },
  { code: "CLP", name: "Chilean Peso", locale: "es-CL", fractionDigits: 0 },
  { code: "CNY", name: "Chinese Yuan", locale: "zh-CN", fractionDigits: 2 },
  { code: "COP", name: "Colombian Peso", locale: "es-CO", fractionDigits: 2 },
  { code: "CRC", name: "Costa Rican Colón", locale: "es-CR", fractionDigits: 2 },
  { code: "CUP", name: "Cuban Peso", locale: "es-CU", fractionDigits: 2 },
  { code: "CVE", name: "Cape Verdean Escudo", locale: "pt-CV", fractionDigits: 2 },
  { code: "CZK", name: "Czech Koruna", locale: "cs-CZ", fractionDigits: 2 },
  { code: "DJF", name: "Djiboutian Franc", locale: "fr-DJ", fractionDigits: 0 },
  { code: "DKK", name: "Danish Krone", locale: "da-DK", fractionDigits: 2 },
  { code: "DOP", name: "Dominican Peso", locale: "es-DO", fractionDigits: 2 },
  { code: "DZD", name: "Algerian Dinar", locale: "ar-DZ", fractionDigits: 2 },
  { code: "EGP", name: "Egyptian Pound", locale: "ar-EG", fractionDigits: 2 },
  { code: "ERN", name: "Eritrean Nakfa", locale: "ti-ER", fractionDigits: 2 },
  { code: "ETB", name: "Ethiopian Birr", locale: "am-ET", fractionDigits: 2 },
  { code: "EUR", name: "Euro", locale: "de-DE", fractionDigits: 2 },
  { code: "FJD", name: "Fijian Dollar", locale: "en-FJ", fractionDigits: 2 },
  { code: "FKP", name: "Falkland Islands Pound", locale: "en-FK", fractionDigits: 2 },
  { code: "GBP", name: "British Pound", locale: "en-GB", fractionDigits: 2 },
  { code: "GEL", name: "Georgian Lari", locale: "ka-GE", fractionDigits: 2 },
  { code: "GHS", name: "Ghanaian Cedi", locale: "en-GH", fractionDigits: 2 },
  { code: "GIP", name: "Gibraltar Pound", locale: "en-GI", fractionDigits: 2 },
  { code: "GMD", name: "Gambian Dalasi", locale: "en-GM", fractionDigits: 2 },
  { code: "GNF", name: "Guinean Franc", locale: "fr-GN", fractionDigits: 0 },
  { code: "GTQ", name: "Guatemalan Quetzal", locale: "es-GT", fractionDigits: 2 },
  { code: "GYD", name: "Guyanaese Dollar", locale: "en-GY", fractionDigits: 2 },
  { code: "HKD", name: "Hong Kong Dollar", locale: "zh-HK", fractionDigits: 2 },
  { code: "HNL", name: "Honduran Lempira", locale: "es-HN", fractionDigits: 2 },
  { code: "HRK", name: "Croatian Kuna", locale: "hr-HR", fractionDigits: 2 },
  { code: "HTG", name: "Haitian Gourde", locale: "fr-HT", fractionDigits: 2 },
  { code: "HUF", name: "Hungarian Forint", locale: "hu-HU", fractionDigits: 2 },
  { code: "IDR", name: "Indonesian Rupiah", locale: "id-ID", fractionDigits: 2 },
  { code: "ILS", name: "Israeli New Shekel", locale: "he-IL", fractionDigits: 2 },
  { code: "INR", name: "Indian Rupee", locale: "en-IN", fractionDigits: 2 },
  { code: "IQD", name: "Iraqi Dinar", locale: "ar-IQ", fractionDigits: 3 },
  { code: "IRR", name: "Iranian Rial", locale: "fa-IR", fractionDigits: 2 },
  { code: "ISK", name: "Icelandic Króna", locale: "is-IS", fractionDigits: 0 },
  { code: "JMD", name: "Jamaican Dollar", locale: "en-JM", fractionDigits: 2 },
  { code: "JOD", name: "Jordanian Dinar", locale: "ar-JO", fractionDigits: 3 },
  { code: "JPY", name: "Japanese Yen", locale: "ja-JP", fractionDigits: 0 },
  { code: "KES", name: "Kenyan Shilling", locale: "en-KE", fractionDigits: 2 },
  { code: "KGS", name: "Kyrgystani Som", locale: "ky-KG", fractionDigits: 2 },
  { code: "KHR", name: "Cambodian Riel", locale: "km-KH", fractionDigits: 2 },
  { code: "KMF", name: "Comorian Franc", locale: "fr-KM", fractionDigits: 0 },
  { code: "KPW", name: "North Korean Won", locale: "ko-KP", fractionDigits: 2 },
  { code: "KRW", name: "South Korean Won", locale: "ko-KR", fractionDigits: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", locale: "ar-KW", fractionDigits: 3 },
  { code: "KYD", name: "Cayman Islands Dollar", locale: "en-KY", fractionDigits: 2 },
  { code: "KZT", name: "Kazakhstani Tenge", locale: "kk-KZ", fractionDigits: 2 },
  { code: "LAK", name: "Laotian Kip", locale: "lo-LA", fractionDigits: 2 },
  { code: "LBP", name: "Lebanese Pound", locale: "ar-LB", fractionDigits: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", locale: "si-LK", fractionDigits: 2 },
  { code: "LRD", name: "Liberian Dollar", locale: "en-LR", fractionDigits: 2 },
  { code: "LSL", name: "Lesotho Loti", locale: "en-LS", fractionDigits: 2 },
  { code: "LYD", name: "Libyan Dinar", locale: "ar-LY", fractionDigits: 3 },
  { code: "MAD", name: "Moroccan Dirham", locale: "ar-MA", fractionDigits: 2 },
  { code: "MDL", name: "Moldovan Leu", locale: "ro-MD", fractionDigits: 2 },
  { code: "MGA", name: "Malagasy Ariary", locale: "mg-MG", fractionDigits: 2 },
  { code: "MKD", name: "Macedonian Denar", locale: "mk-MK", fractionDigits: 2 },
  { code: "MMK", name: "Myanmar Kyat", locale: "my-MM", fractionDigits: 2 },
  { code: "MNT", name: "Mongolian Tugrik", locale: "mn-MN", fractionDigits: 2 },
  { code: "MOP", name: "Macanese Pataca", locale: "zh-MO", fractionDigits: 2 },
  { code: "MRU", name: "Mauritanian Ouguiya", locale: "ar-MR", fractionDigits: 2 },
  { code: "MUR", name: "Mauritian Rupee", locale: "en-MU", fractionDigits: 2 },
  { code: "MVR", name: "Maldivian Rufiyaa", locale: "dv-MV", fractionDigits: 2 },
  { code: "MWK", name: "Malawian Kwacha", locale: "en-MW", fractionDigits: 2 },
  { code: "MXN", name: "Mexican Peso", locale: "es-MX", fractionDigits: 2 },
  { code: "MYR", name: "Malaysian Ringgit", locale: "ms-MY", fractionDigits: 2 },
  { code: "MZN", name: "Mozambican Metical", locale: "pt-MZ", fractionDigits: 2 },
  { code: "NAD", name: "Namibian Dollar", locale: "en-NA", fractionDigits: 2 },
  { code: "NGN", name: "Nigerian Naira", locale: "en-NG", fractionDigits: 2 },
  { code: "NIO", name: "Nicaraguan Córdoba", locale: "es-NI", fractionDigits: 2 },
  { code: "NOK", name: "Norwegian Krone", locale: "nb-NO", fractionDigits: 2 },
  { code: "NPR", name: "Nepalese Rupee", locale: "ne-NP", fractionDigits: 2 },
  { code: "NZD", name: "New Zealand Dollar", locale: "en-NZ", fractionDigits: 2 },
  { code: "OMR", name: "Omani Rial", locale: "ar-OM", fractionDigits: 3 },
  { code: "PAB", name: "Panamanian Balboa", locale: "es-PA", fractionDigits: 2 },
  { code: "PEN", name: "Peruvian Sol", locale: "es-PE", fractionDigits: 2 },
  { code: "PGK", name: "Papua New Guinean Kina", locale: "en-PG", fractionDigits: 2 },
  { code: "PHP", name: "Philippine Peso", locale: "en-PH", fractionDigits: 2 },
  { code: "PKR", name: "Pakistani Rupee", locale: "en-PK", fractionDigits: 2 },
  { code: "PLN", name: "Polish Złoty", locale: "pl-PL", fractionDigits: 2 },
  { code: "PYG", name: "Paraguayan Guarani", locale: "es-PY", fractionDigits: 0 },
  { code: "QAR", name: "Qatari Rial", locale: "ar-QA", fractionDigits: 2 },
  { code: "RON", name: "Romanian Leu", locale: "ro-RO", fractionDigits: 2 },
  { code: "RSD", name: "Serbian Dinar", locale: "sr-RS", fractionDigits: 2 },
  { code: "RUB", name: "Russian Ruble", locale: "ru-RU", fractionDigits: 2 },
  { code: "RWF", name: "Rwandan Franc", locale: "rw-RW", fractionDigits: 0 },
  { code: "SAR", name: "Saudi Riyal", locale: "ar-SA", fractionDigits: 2 },
  { code: "SBD", name: "Solomon Islands Dollar", locale: "en-SB", fractionDigits: 2 },
  { code: "SCR", name: "Seychellois Rupee", locale: "en-SC", fractionDigits: 2 },
  { code: "SDG", name: "Sudanese Pound", locale: "ar-SD", fractionDigits: 2 },
  { code: "SEK", name: "Swedish Krona", locale: "sv-SE", fractionDigits: 2 },
  { code: "SGD", name: "Singapore Dollar", locale: "en-SG", fractionDigits: 2 },
  { code: "SHP", name: "St. Helena Pound", locale: "en-SH", fractionDigits: 2 },
  { code: "SLE", name: "Sierra Leonean Leone", locale: "en-SL", fractionDigits: 2 },
  { code: "SOS", name: "Somali Shilling", locale: "so-SO", fractionDigits: 2 },
  { code: "SRD", name: "Surinamese Dollar", locale: "nl-SR", fractionDigits: 2 },
  { code: "SSP", name: "South Sudanese Pound", locale: "en-SS", fractionDigits: 2 },
  { code: "STN", name: "São Tomé & Príncipe Dobra", locale: "pt-ST", fractionDigits: 2 },
  { code: "SVC", name: "Salvadoran Colón", locale: "es-SV", fractionDigits: 2 },
  { code: "SYP", name: "Syrian Pound", locale: "ar-SY", fractionDigits: 2 },
  { code: "SZL", name: "Swazi Lilangeni", locale: "en-SZ", fractionDigits: 2 },
  { code: "THB", name: "Thai Baht", locale: "th-TH", fractionDigits: 2 },
  { code: "TJS", name: "Tajikistani Somoni", locale: "tg-TJ", fractionDigits: 2 },
  { code: "TMT", name: "Turkmenistani Manat", locale: "tk-TM", fractionDigits: 2 },
  { code: "TND", name: "Tunisian Dinar", locale: "ar-TN", fractionDigits: 3 },
  { code: "TOP", name: "Tongan Paʻanga", locale: "to-TO", fractionDigits: 2 },
  { code: "TRY", name: "Turkish Lira", locale: "tr-TR", fractionDigits: 2 },
  { code: "TTD", name: "Trinidad & Tobago Dollar", locale: "en-TT", fractionDigits: 2 },
  { code: "TWD", name: "New Taiwan Dollar", locale: "zh-TW", fractionDigits: 2 },
  { code: "TZS", name: "Tanzanian Shilling", locale: "en-TZ", fractionDigits: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", locale: "uk-UA", fractionDigits: 2 },
  { code: "UGX", name: "Ugandan Shilling", locale: "en-UG", fractionDigits: 0 },
  { code: "USD", name: "US Dollar", locale: "en-US", fractionDigits: 2 },
  { code: "UYU", name: "Uruguayan Peso", locale: "es-UY", fractionDigits: 2 },
  { code: "UZS", name: "Uzbekistani Som", locale: "uz-UZ", fractionDigits: 2 },
  { code: "VES", name: "Venezuelan Bolívar", locale: "es-VE", fractionDigits: 2 },
  { code: "VND", name: "Vietnamese Dong", locale: "vi-VN", fractionDigits: 0 },
  { code: "VUV", name: "Vanuatu Vatu", locale: "en-VU", fractionDigits: 0 },
  { code: "WST", name: "Samoan Tala", locale: "en-WS", fractionDigits: 2 },
  { code: "XAF", name: "Central African CFA Franc", locale: "fr-CM", fractionDigits: 0 },
  { code: "XCD", name: "East Caribbean Dollar", locale: "en-AG", fractionDigits: 2 },
  { code: "XOF", name: "West African CFA Franc", locale: "fr-SN", fractionDigits: 0 },
  { code: "XPF", name: "CFP Franc", locale: "fr-PF", fractionDigits: 0 },
  { code: "YER", name: "Yemeni Rial", locale: "ar-YE", fractionDigits: 2 },
  { code: "ZAR", name: "South African Rand", locale: "en-ZA", fractionDigits: 2 },
  { code: "ZMW", name: "Zambian Kwacha", locale: "en-ZM", fractionDigits: 2 },
  { code: "ZWG", name: "Zimbabwean Gold", locale: "en-ZW", fractionDigits: 2 },
];

export const DEFAULT_CURRENCY_CODE = "USD";

const BY_CODE = new Map<string, CurrencyMeta>(CURRENCIES.map((c) => [c.code, c]));

export function getCurrencyMeta(code: string | null | undefined): CurrencyMeta {
  if (!code) return BY_CODE.get(DEFAULT_CURRENCY_CODE)!;
  const upper = String(code).toUpperCase();
  return BY_CODE.get(upper) ?? BY_CODE.get(DEFAULT_CURRENCY_CODE)!;
}

export function normalizeCurrencyCode(code: unknown): string {
  if (typeof code !== "string") return DEFAULT_CURRENCY_CODE;
  const upper = code.toUpperCase();
  return BY_CODE.has(upper) ? upper : DEFAULT_CURRENCY_CODE;
}

// Format a whole-unit amount in the selected currency. Mirrors the old
// formatCurrency(n) signature but takes the currency code as a second
// argument.
//
// TIM-1309: `compact` (K/M bucketing) is opt-in. Chart axes stay readable
// with it on, but the financial statements show full exact figures so a
// small change in the entered value is never rounded into a misleading "K".
export function formatCurrencyAmount(
  n: number,
  code: string = DEFAULT_CURRENCY_CODE,
  opts: { compact?: boolean } = {}
): string {
  const meta = getCurrencyMeta(code);
  // Default to compact so existing callers (chart axes, buildout/equipment
  // prices, summary banners) keep their K/M behavior. The statement tables
  // opt out via fmt() to show full exact figures.
  const compact = opts.compact ?? true;

  if (compact) {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    // Compact short-forms (no fraction digits, currency symbol from formatter)
    if (abs >= 1_000_000) {
      return `${sign}${shortFormatWithSymbol(abs / 1_000_000, meta)}M`;
    }
    if (abs >= 1_000) {
      const rounded = Math.round(abs / 100) / 10;
      return `${sign}${shortFormatWithSymbol(rounded, meta)}K`;
    }
  }

  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// Render a numeric value with the currency symbol (no fraction digits).
// Used to build the K / M compact strings.
function shortFormatWithSymbol(n: number, meta: CurrencyMeta): string {
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

// Format a minor-unit (e.g. cents) value. Divides by the appropriate exponent
// for the currency. For 0-fraction-digit currencies (JPY, KRW…), this is a
// pass-through.
export function formatMinorUnits(
  minorUnits: number,
  code: string = DEFAULT_CURRENCY_CODE
): string {
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  return formatCurrencyAmount(minorUnits / divisor, meta.code);
}

// Return the currency symbol alone (e.g., "€", "$") — used for input prefixes.
export function currencySymbol(code: string = DEFAULT_CURRENCY_CODE): string {
  const meta = getCurrencyMeta(code);
  const parts = new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  const sym = parts.find((p) => p.type === "currency");
  return sym?.value ?? meta.code;
}
