"use client";

import Link from "next/link";
import { Header } from "@/components/ui/Header";
import { DropIcon } from "@/components/ui/icons";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { api } from "@/lib/client/api";
import { useAsync } from "@/lib/client/useAsync";
import { CourseRow } from "./CourseRow";

export function DashboardView() {
  const { state, reload } = useAsync(api.dashboard);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {state.status === "loading" ? <StatusMessage title="Loading your courses" /> : null}

        {state.status === "error" ? (
          <StatusMessage
            title="Your courses didn't load"
            action={
              <button type="button" onClick={reload} className="rounded-lg bg-ink px-4 py-2 font-bold text-white">
                Try again
              </button>
            }
          >
            {state.message}
          </StatusMessage>
        ) : null}

        {state.status === "ready" ? (
          <div className="grid gap-6 md:grid-cols-[1fr_16rem] md:gap-8">
            <aside className="order-first h-fit rounded-xl bg-ink p-4 text-white md:order-last md:p-5">
              <h2 className="text-sm font-bold text-white/60">Today</h2>
              <div className="mt-2 flex items-center gap-3 md:mt-3 md:block">
                <p className="flex items-center gap-2 text-3xl font-extrabold tabular-nums md:text-4xl">
                  <DropIcon className="h-6 w-6 text-water md:h-7 md:w-7" />
                  {state.data.totalDue}
                </p>
                <p className="text-sm text-white/70 md:mt-1">
                  {state.data.totalDue === 1 ? "word needs reviewing" : "words need reviewing"}
                </p>
              </div>
            </aside>

            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h1 className="text-2xl font-extrabold">Your courses</h1>
                <Link
                  href="/courses/new"
                  className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-bold text-white hover:bg-ink-soft"
                >
                  New course
                </Link>
              </div>
              {state.data.courses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center">
                  <p className="text-ink/70">You don&apos;t have any courses yet.</p>
                  <Link
                    href="/courses/new"
                    className="mt-2 inline-flex min-h-11 items-center font-bold text-water hover:underline"
                  >
                    Create your first course
                  </Link>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {state.data.courses.map((course) => (
                    <CourseRow key={course.courseId} course={course} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}