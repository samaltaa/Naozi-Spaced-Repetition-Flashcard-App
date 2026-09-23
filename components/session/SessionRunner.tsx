"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { api, errorMessage } from "@/lib/client/api";
import type { ReviewResult, SessionMode, SessionStep } from "@/lib/client/types";
import { LEARNING_STEPS } from "@/lib/srs/constants";
import { FeedbackBar } from "./FeedbackBar";
import { GrowthMeter } from "./GrowthMeter";
import { IntroCard } from "./IntroCard";
import { MultipleChoice } from "./MultipleChoice";
import { SessionSummary } from "./SessionSummary";
import { SessionTopBar } from "./SessionTopBar";
import { TypingQuestion } from "./TypingQuestion";

// Constants

const REINSERT_GAP = 3;
const AUTO_ADVANCE_MS = 900;

// Types

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

type Props = {
  courseId: string;
  mode: SessionMode;
};

// Helpers

function targetLangOf(queue: SessionStep[]): string | undefined {
  for (const step of queue) {
    if (step.type === "question" && step.question.kind === "typing") return step.question.targetLang;
  }
  return undefined;
}

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("button, input, textarea, select, a") !== null;
}

// Component

export function SessionRunner({ courseId, mode }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<SessionStep[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [growth, setGrowth] = useState<Record<string, number>>({});
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [missed, setMissed] = useState<string[]>([]);
  const [learningSteps, setLearningSteps] = useState(LEARNING_STEPS);
  const [remaining, setRemaining] = useState(0);
  const shownAt = useRef(0);

  const step = queue[index];
  const lang = useMemo(() => targetLangOf(queue), [queue]);

  // Loading

  useEffect(() => {
    let active = true;
    api
      .session(courseId, mode)
      .then((payload) => {
        if (!active) return;
        setQueue(payload.steps);
        setLearningSteps(payload.learningSteps);
        setRemaining(payload.remainingToday);
        setIndex(0);
        setPicked(null);
        setResult(null);
        setSubmitError(null);
        setGrowth({});
        setTally({ correct: 0, wrong: 0 });
        setMissed([]);
        setLoad({ status: "ready" });
      })
      .catch((err: unknown) => {
        if (active) setLoad({ status: "error", message: errorMessage(err, "The session didn't load") });
      });
    return () => {
      active = false;
    };
  }, [courseId, mode, round]);

  const restart = useCallback(() => {
    setLoad({ status: "loading" });
    setRound((r) => r + 1);
  }, []);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index, load.status]);

  // Navigation

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
    setPicked(null);
    setResult(null);
    setSubmitError(null);
  }, []);

  // Answering

  const answer = useCallback(
    async (value: string) => {
      if (!step || step.type !== "question" || submitting || result) return;
      const question = step.question;

      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setPicked(value);
      setSubmitting(true);
      setSubmitError(null);

      try {
        const res = await api.submitReview({
          id: crypto.randomUUID(),
          itemId: question.itemId,
          testType: question.kind,
          answer: value,
          responseMs: Math.round(performance.now() - shownAt.current),
        });
        setResult(res);

        if (res.correct) {
          setTally((t) => ({ ...t, correct: t.correct + 1 }));
          setGrowth((g) => ({ ...g, [question.itemId]: (g[question.itemId] ?? 0) + 1 }));
        } else {
          setTally((t) => ({ ...t, wrong: t.wrong + 1 }));
          setMissed((m) => (m.includes(question.prompt) ? m : [...m, question.prompt]));
          setQueue((q) => {
            const at = Math.min(index + 1 + REINSERT_GAP, q.length);
            return [...q.slice(0, at), step, ...q.slice(at)];
          });
        }
      } catch (err) {
        setPicked(null);
        setSubmitError(errorMessage(err, "Your answer wasn't saved. Try again."));
      } finally {
        setSubmitting(false);
      }
    },
    [step, submitting, result, index],
  );

  // Auto-advance on clean answers

  useEffect(() => {
    if (!result || result.verdict !== "exact") return;
    const timer = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [result, advance]);

  // Enter to continue

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || isInteractive(e.target)) return;
      if (step?.type === "intro" || result) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, result, advance]);

  // States

  if (load.status === "loading") {
    return <StatusMessage title="Getting your session ready" />;
  }

  if (load.status === "error") {
    return (
      <StatusMessage
        title="The session didn't load"
        action={
          <>
            <button type="button" onClick={restart} className="rounded-lg bg-ink px-4 py-2 font-bold text-white">
              Try again
            </button>
            <Link href={`/courses/${courseId}`} className="rounded-lg border border-ink/20 px-4 py-2 font-bold">
              Back to course
            </Link>
          </>
        }
      >
        {load.message}
      </StatusMessage>
    );
  }

  if (queue.length === 0) {
    return (
      <StatusMessage
        title={mode === "learn" ? "No new words for today" : "Nothing to review right now"}
        action={
          <Link href={`/courses/${courseId}`} className="rounded-lg bg-ink px-4 py-2 font-bold text-white">
            Back to course
          </Link>
        }
      >
        {mode === "learn"
          ? "You've reached today's limit or learned every word in this course."
          : "Words come back here when they're due. Check again later."}
      </StatusMessage>
    );
  }

  if (!step) {
    return (
      <SessionSummary
        mode={mode}
        courseId={courseId}
        correct={tally.correct}
        wrong={tally.wrong}
        missed={missed}
        remaining={remaining}
        onAgain={restart}
      />
    );
  }

  // Session

  return (
    <div className="flex min-h-dvh flex-col">
      <SessionTopBar courseId={courseId} done={index} total={queue.length} />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 pb-56 pt-4 sm:justify-center sm:pb-40 sm:pt-6">
        {step.type === "intro" ? (
          <IntroCard key={index} step={step} lang={lang} steps={learningSteps} onContinue={advance} />
        ) : (
          <div key={index} className="animate-pop w-full text-center">
            {mode === "learn" ? (
              <GrowthMeter stage={growth[step.question.itemId] ?? 0} steps={learningSteps} />
            ) : null}
            <p className="text-sm font-semibold text-ink/50">
              {step.question.kind === "multiple_choice" ? "Pick the translation" : "Type the translation"}
            </p>
            <p dir="auto" className="mt-2 break-words text-3xl font-extrabold leading-tight sm:mt-3 sm:text-5xl">
              {step.question.prompt}
            </p>

            <div className="mt-6 sm:mt-10">
              {step.question.kind === "multiple_choice" ? (
                <MultipleChoice
                  question={step.question}
                  lang={lang}
                  picked={picked}
                  result={result}
                  disabled={submitting || result !== null}
                  onPick={answer}
                />
              ) : (
                <TypingQuestion
                  question={step.question}
                  result={result}
                  disabled={submitting || result !== null}
                  onSubmit={answer}
                />
              )}
            </div>

            {submitError ? (
              <p role="alert" className="mt-4 font-semibold text-berry">
                {submitError}
              </p>
            ) : null}
          </div>
        )}
      </main>

      {result ? <FeedbackBar result={result} picked={picked} lang={lang} onContinue={advance} /> : null}
    </div>
  );
}