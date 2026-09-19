"use client";

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
      <main className="mx-auto max-w-5xl px-4 py-8">
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
          <div className="grid gap-8 md:grid-cols-[1fr_16rem]">
            <section>
              <h1 className="mb-4 text-2xl font-extrabold">Your courses</h1>
              {state.data.courses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center text-ink/70">
                  You don&apos;t have any courses yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {state.data.courses.map((course) => (
                    <CourseRow key={course.courseId} course={course} />
                  ))}
                </ul>
              )}
            </section>

            <aside className="h-fit rounded-xl bg-ink p-5 text-white">
              <h2 className="text-sm font-bold text-white/60">Today</h2>
              <p className="mt-3 flex items-center gap-2 text-4xl font-extrabold tabular-nums">
                <DropIcon className="h-7 w-7 text-water" />
                {state.data.totalDue}
              </p>
              <p className="mt-1 text-sm text-white/70">
                {state.data.totalDue === 1 ? "word needs reviewing" : "words need reviewing"}
              </p>
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}