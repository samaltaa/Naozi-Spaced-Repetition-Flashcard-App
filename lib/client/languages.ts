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

// Names

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}