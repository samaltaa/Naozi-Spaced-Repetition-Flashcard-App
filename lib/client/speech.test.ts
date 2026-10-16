import { describe, expect, it } from "vitest";
import { pickVoice } from "./speech";

// Fixtures

const voices = [
  { name: "Monica", lang: "es-ES" },
  { name: "Paulina", lang: "es-MX" },
  { name: "Google español de Estados Unidos", lang: "es-US" },
  { name: "Samantha", lang: "en-US" },
  { name: "Milena", lang: "ru-RU" },
  { name: "Sinji", lang: "zh-HK" },
  { name: "Mei-Jia", lang: "zh-TW" },
  { name: "Tingting", lang: "zh-CN" },
];

// Voice selection

describe("pickVoice", () => {
  it("prefers an exact locale match", () => {
    expect(pickVoice(voices, "es-MX")?.name).toBe("Paulina");
  });

  it("falls back to the base language", () => {
    expect(pickVoice(voices, "ru")?.lang).toBe("ru-RU");
    expect(pickVoice(voices, "en-GB")?.lang).toBe("en-US");
  });

  it("prefers higher quality voices among equal matches", () => {
    expect(pickVoice(voices, "es")?.name).toBe("Google español de Estados Unidos");
  });

  it("uses Mandarin voices for Chinese and never Cantonese", () => {
    expect(pickVoice(voices, "zh")?.lang).toBe("zh-CN");
    expect(pickVoice(voices, "zh-TW")?.lang).toBe("zh-TW");
    expect(pickVoice([{ name: "Sinji", lang: "zh-HK" }], "zh")).toBeNull();
    expect(pickVoice([{ name: "Sinji", lang: "zh-HK" }], "zh-HK")?.lang).toBe("zh-HK");
  });

  it("accepts underscore language tags", () => {
    expect(pickVoice([{ name: "Irina", lang: "ru_RU" }], "ru")?.name).toBe("Irina");
  });

  it("returns null when no voice speaks the language", () => {
    expect(pickVoice(voices, "de")).toBeNull();
  });
});
