import Link from "next/link";
import { DropIcon, FlowerIcon } from "@/components/ui/icons";
import type { SessionMode } from "@/lib/client/types";

type Props = {
  mode: SessionMode;
  courseId: string;
  correct: number;
  wrong: number;
  missed: string[];
  onAgain: () => void;
};

export function SessionSummary({ mode, courseId, correct, wrong, missed, onAgain }: Props) {
  const Icon = mode === "learn" ? FlowerIcon : DropIcon;

  return (
    <div className="animate-pop mx-auto flex max-w-md flex-col items-center px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-12 text-center sm:py-16">
      <Icon className={`h-16 w-16 ${mode === "learn" ? "text-sun" : "text-water"}`} />
      <h1 className="mt-4 text-3xl font-extrabold">Session complete</h1>
      <p className="mt-2 text-lg text-ink/70">
        {correct} correct, {wrong} missed
      </p>

      {missed.length > 0 ? (
        <div className="mt-8 w-full rounded-xl border border-ink/10 bg-white p-4 text-left">
          <h2 className="text-sm font-bold text-ink/60">Words to watch</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {missed.map((prompt) => (
              <li key={prompt} dir="auto" className="font-semibold">
                {prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onAgain}
          className={`min-h-12 rounded-lg px-6 py-3 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] ${
            mode === "learn" ? "bg-leaf hover:bg-leaf-dark" : "bg-water hover:bg-water-dark"
          }`}
        >
          {mode === "learn" ? "Learn more words" : "Review more"}
        </button>
        <Link href={`/courses/${courseId}`} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-ink/20 bg-white px-6 py-3 font-bold">
          Back to course
        </Link>
      </div>
    </div>
  );
}