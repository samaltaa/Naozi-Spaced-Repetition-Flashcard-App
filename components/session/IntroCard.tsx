import type { SessionStep } from "@/lib/client/types";
import { GrowthMeter } from "./GrowthMeter";

type IntroStep = Extract<SessionStep, { type: "intro" }>;

type Props = {
  step: IntroStep;
  lang: string | undefined;
  onContinue: () => void;
};

export function IntroCard({ step, lang, onContinue }: Props) {
  return (
    <div className="animate-pop flex w-full flex-col items-center text-center">
      <GrowthMeter stage={0} />
      <p className="text-sm font-bold text-leaf-dark">New word</p>
      <p dir="auto" className="mt-6 text-2xl text-ink/70">
        {step.prompt}
      </p>
      <p dir="auto" lang={lang} className="mt-3 text-5xl font-extrabold leading-tight sm:text-6xl">
        {step.answer}
      </p>
      {step.reading ? (
        <p lang={lang} className="mt-2 text-xl text-ink/60">
          {step.reading}
        </p>
      ) : null}
      {step.notes ? <p className="mt-6 max-w-prose text-ink/70">{step.notes}</p> : null}
      <button
        type="button"
        onClick={onContinue}
        className="mt-12 rounded-lg bg-leaf px-8 py-3 text-lg font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark active:translate-y-px active:shadow-none"
      >
        Got it
      </button>
      <p className="mt-3 text-sm text-ink/40">or press Enter</p>
    </div>
  );
}