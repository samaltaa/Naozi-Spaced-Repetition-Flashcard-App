"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Header } from "@/components/ui/Header";
import { LanguageTile } from "@/components/ui/LanguageTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { StudyButton } from "@/components/ui/StudyButton";
import { api } from "@/lib/client/api";
import { languageName } from "@/lib/client/languages";
import type { CourseLevel } from "@/lib/client/types";
import { useAsync } from "@/lib/client/useAsync";

// Level list

function LevelSection({ level, number }: { level: CourseLevel; number: number }) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink/10 bg-white">
      <header className="flex items-baseline gap-3 border-b border-ink/10 px-4 py-3">
        <span className="text-sm font-bold text-ink/50">Level {number}</span>
        <h2 className="text-lg font-extrabold">{level.title}</h2>
        <span className="ml-auto text-sm text-ink/50">
          {level.items.length} {level.items.length === 1 ? "word" : "words"}
        </span>
      </header>
      {level.items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink/60">No words in this level yet.</p>
      ) : (
        <ul className="divide-y divide-ink/5">
          {level.items.map((item) => (
            <li key={item.id} className="grid grid-cols-2 gap-4 px-4 py-2.5">
              <span dir="auto" className="text-ink/80">
                {item.prompt}
              </span>
              <span dir="auto" className="font-bold">
                {item.answer}
                {item.reading ? <span className="ml-2 text-sm font-normal text-ink/50">{item.reading}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// View

export function CourseView({ courseId }: { courseId: string }) {
  const load = useCallback(() => Promise.all([api.course(courseId), api.dashboard()]), [courseId]);
  const { state, reload } = useAsync(load);

  if (state.status !== "ready") {
    return (
      <>
        <Header />
        {state.status === "loading" ? (
          <StatusMessage title="Loading course" />
        ) : (
          <StatusMessage
            title="This course didn't load"
            action={
              <>
                <button type="button" onClick={reload} className="rounded-lg bg-ink px-4 py-2 font-bold text-white">
                  Try again
                </button>
                <Link href="/" className="rounded-lg border border-ink/20 px-4 py-2 font-bold">
                  Back to courses
                </Link>
              </>
            }
          >
            {state.message}
          </StatusMessage>
        )}
      </>
    );
  }

  const [course, dashboard] = state.data;
  const stats = dashboard.courses.find((c) => c.courseId === course.id);
  const total = course.levels.reduce((sum, level) => sum + level.items.length, 0);
  const learned = stats?.learnedCount ?? 0;
  const due = stats?.dueCount ?? 0;
  const fresh = stats?.newAvailable ?? total;

  return (
    <>
      <Header />

      <div className="bg-ink-soft text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center">
          <LanguageTile code={course.target_lang} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h1 className="text-3xl font-extrabold">{course.title}</h1>
              <Link
                href={`/courses/${course.id}/edit`}
                className="text-sm font-bold text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                Edit course
              </Link>
            </div>
            <p className="mt-1 text-white/70">
              {languageName(course.target_lang)} from {languageName(course.source_lang)}
            </p>
            {course.description ? <p className="mt-2 max-w-prose text-white/85">{course.description}</p> : null}
            <div className="mt-4 max-w-sm">
              <ProgressBar value={total === 0 ? 0 : learned / total} color="bg-sun" label="Course progress" />
              <p className="mt-1 text-sm text-white/70">
                {learned} of {total} words learned
              </p>
            </div>
          </div>
          <div className="flex gap-2 sm:flex-col">
            <StudyButton
              href={`/courses/${course.id}/learn`}
              kind="learn"
              size="lg"
              label="Learn new words"
              disabled={fresh === 0}
            />
            <StudyButton
              href={`/courses/${course.id}/review`}
              kind="review"
              size="lg"
              label={due === 0 ? "Nothing to review" : `Review ${due}`}
              disabled={due === 0}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8">
        {course.levels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center">
            <p className="text-ink/70">This course has no words yet.</p>
            <Link href={`/courses/${course.id}/edit`} className="mt-3 inline-block font-bold text-water hover:underline">
              Add words
            </Link>
          </div>
        ) : (
          course.levels.map((level, i) => <LevelSection key={level.id} level={level} number={i + 1} />)
        )}
      </main>
    </>
  );
}