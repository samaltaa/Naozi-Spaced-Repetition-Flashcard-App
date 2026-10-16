"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Voice selection

export type VoiceInfo = Pick<SpeechSynthesisVoice, "lang" | "name">;

const RATE = 0.9;
const QUALITY = /natural|neural|enhanced|premium|google/i;
const DEFAULT_REGIONS: Record<string, string> = { zh: "zh-cn" };
const OTHER_LANGUAGES: Record<string, RegExp> = { zh: /^zh-(hk|mo)|^yue/ };

function normalize(tag: string): string {
  return tag.replace(/_/g, "-").toLowerCase();
}

function baseOf(tag: string): string {
  return normalize(tag).split("-")[0] ?? "";
}

export function pickVoice<T extends VoiceInfo>(voices: readonly T[], lang: string): T | null {
  const base = baseOf(lang);
  const wanted = normalize(lang).includes("-") ? normalize(lang) : (DEFAULT_REGIONS[base] ?? normalize(lang));
  const excluded = OTHER_LANGUAGES[base];
  const matches = voices.filter((v) => {
    const tag = normalize(v.lang);
    if (excluded?.test(tag) && !excluded.test(wanted)) return false;
    return baseOf(tag) === base;
  });
  if (matches.length === 0) return null;

  const rank = (v: T) => (normalize(v.lang) === wanted ? 2 : 0) + (QUALITY.test(v.name) ? 1 : 0);
  return matches.reduce((best, v) => (rank(v) > rank(best) ? v : best));
}

// Voice list

const NO_VOICES: SpeechSynthesisVoice[] = [];
let voices: SpeechSynthesisVoice[] = NO_VOICES;

function supported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {};
  const synth = window.speechSynthesis;
  const handler = () => {
    voices = synth.getVoices();
    onChange();
  };
  synth.addEventListener("voiceschanged", handler);
  return () => synth.removeEventListener("voiceschanged", handler);
}

function getVoices(): SpeechSynthesisVoice[] {
  if (!supported()) return NO_VOICES;
  if (voices.length === 0) {
    const loaded = window.speechSynthesis.getVoices();
    if (loaded.length > 0) voices = loaded;
  }
  return voices;
}

function getServerVoices(): SpeechSynthesisVoice[] {
  return NO_VOICES;
}

// Hook

export function useSpeech(lang: string | undefined) {
  const available = useSyncExternalStore(subscribe, getVoices, getServerVoices);
  const voice = lang ? pickVoice(available, lang) : null;
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (current.current && supported()) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voice || !supported()) return;
      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = RATE;
      const finish = () => {
        if (current.current !== utterance) return;
        current.current = null;
        setSpeaking(false);
      };
      utterance.onend = finish;
      utterance.onerror = finish;

      current.current = utterance;
      setSpeaking(true);
      synth.speak(utterance);
    },
    [voice],
  );

  return { canSpeak: voice !== null, speak, speaking };
}
