"use client";

import { SpeakerIcon } from "@/components/ui/icons";
import { useSpeech } from "@/lib/client/speech";

type Props = {
  text: string;
  lang: string | undefined;
  className?: string;
};

export function SpeakButton({ text, lang, className = "" }: Props) {
  const { canSpeak, speak, speaking } = useSpeech(lang);
  if (!canSpeak) return null;

  return (
    <button
      type="button"
      onClick={() => speak(text)}
      aria-label={`Play pronunciation of ${text}`}
      title="Play pronunciation"
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5 active:translate-y-px ${speaking ? "opacity-60" : ""} ${className}`}
    >
      <SpeakerIcon className="size-6" />
    </button>
  );
}
