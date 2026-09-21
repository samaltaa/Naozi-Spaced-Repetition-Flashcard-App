import type { ReviewResult } from "@/lib/client/types";

type Props = {
  result: ReviewResult;
  picked: string | null;
  lang: string | undefined;
  onContinue: () => void;
};

const COPY = {
  exact: "Correct",
  accents: "Correct, but check the accents",
  typo: "Accepted, but check the spelling",
  wrong: "Not quite",
} as const;

const TONES = {
  exact: "bg-leaf text-white",
  accents: "bg-sun text-ink",
  typo: "bg-sun text-ink",
  wrong: "bg-berry text-white",
} as const;

export function FeedbackBar({ result, picked, lang, onContinue }: Props) {
  const showAnswer = result.verdict !== "exact";

  return (
    <div role="status" className={`animate-rise fixed inset-x-0 bottom-0 ${TONES[result.verdict]}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:gap-4 sm:py-5">
        <div className="min-w-0 flex-1 break-words">
          <p className="text-xl font-extrabold">{COPY[result.verdict]}</p>
          {showAnswer ? (
            <p className="mt-1">
              Answer:{" "}
              <span dir="auto" lang={lang} className="font-extrabold">
                {result.correctAnswer}
              </span>
            </p>
          ) : null}
          {result.verdict === "wrong" && picked ? (
            <p className="mt-0.5 opacity-80">
              You answered:{" "}
              <span dir="auto" lang={lang}>
                {picked}
              </span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="min-h-12 w-full rounded-lg bg-white px-6 py-3 font-bold text-ink sm:w-auto shadow-[0_3px_0_rgba(0,0,0,0.18)] active:translate-y-px active:shadow-none"
        >
          Continue
        </button>
      </div>
    </div>
  );
}