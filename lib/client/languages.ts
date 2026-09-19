// Accent characters

const ACCENTS: Record<string, string[]> = {
  es: ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"],
  fr: ["à", "â", "æ", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "œ", "ù", "û", "ü", "ÿ"],
  de: ["ä", "ö", "ü", "ß"],
  pt: ["á", "â", "ã", "à", "ç", "é", "ê", "í", "ó", "ô", "õ", "ú"],
  it: ["à", "è", "é", "ì", "ò", "ù"],
  ca: ["à", "è", "é", "í", "ï", "ò", "ó", "ú", "ü", "ç"],
  ro: ["ă", "â", "î", "ș", "ț"],
  tr: ["ç", "ğ", "ı", "İ", "ö", "ş", "ü"],
  pl: ["ą", "ć", "ę", "ł", "ń", "ó", "ś", "ź", "ż"],
  cs: ["á", "č", "ď", "é", "ě", "í", "ň", "ó", "ř", "š", "ť", "ú", "ů", "ý", "ž"],
  nl: ["é", "ë", "ï", "ó", "ö", "ü"],
  sv: ["å", "ä", "ö"],
  da: ["æ", "ø", "å"],
  no: ["æ", "ø", "å"],
  nb: ["æ", "ø", "å"],
  is: ["á", "ð", "é", "í", "ó", "ú", "ý", "þ", "æ", "ö"],
  ht: ["è", "ò"],
};

export function accentsFor(lang: string): string[] {
  const base = lang.toLowerCase().split("-")[0] ?? "";
  return ACCENTS[base] ?? [];
}

// Language list

const LANGUAGE_CODES = [
  "af", "am", "ar", "az", "be", "bg", "bn", "bo", "bs", "ca", "ceb", "cs", "cy", "da", "de", "el",
  "en", "eo", "es", "et", "eu", "fa", "fi", "fil", "fr", "ga", "gd", "gl", "grc", "gu", "ha", "haw",
  "he", "hi", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "ja", "jv", "ka", "kk", "km", "kn",
  "ko", "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt",
  "my", "ne", "nl", "no", "pa", "pl", "pt", "qu", "ro", "ru", "sd", "si", "sk", "sl", "sm", "sn",
  "so", "sq", "sr", "sv", "sw", "ta", "te", "tg", "th", "tk", "tr", "tt", "ug", "uk", "ur", "uz",
  "vi", "xh", "yi", "yo", "zh", "zu",
];

export interface LanguageOption {
  code: string;
  name: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = LANGUAGE_CODES.map((code) => ({ code, name: languageName(code) })).sort(
  (a, b) => a.name.localeCompare(b.name, "en"),
);

export function isKnownLanguage(code: string): boolean {
  return LANGUAGE_CODES.includes(code);
}

// Names

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}