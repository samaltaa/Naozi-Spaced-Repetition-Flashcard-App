"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Header } from "@/components/ui/Header";
import { LanguageTile } from "@/components/ui/LanguageTile";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { api, errorMessage } from "@/lib/client/api";
import { toFormValues } from "@/lib/client/editor";
import { languageName } from "@/lib/client/languages";
import type {
  CourseDetail,
  CourseFormValues,
  CourseItem,
  CourseLevel,
  CourseRecord,
  ItemInput,
  UpdateItemInput,
} from "@/lib/client/types";
import { useAsync } from "@/lib/client/useAsync";
import { AddLevelForm } from "./AddLevelForm";
import { CourseForm } from "./CourseForm";
import { LevelPanel } from "./LevelPanel";

// Types

type Tab = "words" | "settings";

const IMPORT_BATCH = 500;

const TABS: { id: Tab; label: string }[] = [
  { id: "words", label: "Levels and words" },
  { id: "settings", label: "Settings" },
];

// Helpers

function stripLevels(course: CourseDetail): CourseRecord {
  return {
    id: course.id,
    owner_id: course.owner_id,
    title: course.title,
    description: course.description,
    source_lang: course.source_lang,
    target_lang: course.target_lang,
    visibility: course.visibility,
    diacritic_mode: course.diacritic_mode,
    new_per_day: course.new_per_day,
    max_reviews_per_day: course.max_reviews_per_day,
  };
}

function mapItems(levels: CourseLevel[], levelId: string, fn: (items: CourseItem[]) => CourseItem[]) {
  return levels.map((level) => (level.id === levelId ? { ...level, items: fn(level.items) } : level));
}

// Editor body

function EditorBody({ initial }: { initial: CourseDetail }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseRecord>(() => stripLevels(initial));
  const [levels, setLevels] = useState<CourseLevel[]>(initial.levels);
  const [tab, setTab] = useState<Tab>("words");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalWords = levels.reduce((sum, level) => sum + level.items.length, 0);
  const sourceLabel = languageName(course.source_lang);
  const targetLabel = languageName(course.target_lang);

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setError(null);
    setNotice(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err, "That change wasn't saved."));
      return false;
    }
  }, []);

  // Levels

  const addLevel = (title: string) =>
    run(async () => {
      const level = await api.createLevel(course.id, { title });
      setLevels((ls) => [...ls, { id: level.id, title: level.title, position: level.position, items: [] }]);
    });

  const renameLevel = (levelId: string, title: string) =>
    run(async () => {
      const level = await api.updateLevel(levelId, { title });
      setLevels((ls) => ls.map((l) => (l.id === levelId ? { ...l, title: level.title } : l)));
    });

  const deleteLevel = (levelId: string) =>
    run(async () => {
      await api.deleteLevel(levelId);
      setLevels((ls) => ls.filter((l) => l.id !== levelId));
    });

  // Items

  const createItem = async (levelId: string, input: ItemInput) => {
    const [item] = await api.createItems(levelId, input);
    if (item) setLevels((ls) => mapItems(ls, levelId, (items) => [...items, item]));
  };

  const updateItem = async (levelId: string, itemId: string, changes: UpdateItemInput) => {
    const item = await api.updateItem(itemId, changes);
    setLevels((ls) => mapItems(ls, levelId, (items) => items.map((i) => (i.id === itemId ? item : i))));
  };

  const deleteItem = async (levelId: string, itemId: string) => {
    await api.deleteItem(itemId);
    setLevels((ls) => mapItems(ls, levelId, (items) => items.filter((i) => i.id !== itemId)));
  };

  const importItems = async (levelId: string, items: ItemInput[], onProgress: (done: number) => void) => {
    const created: CourseItem[] = [];
    setNotice(null);
    try {
      for (let i = 0; i < items.length; i += IMPORT_BATCH) {
        const batch = await api.createItems(levelId, items.slice(i, i + IMPORT_BATCH));
        created.push(...batch);
        onProgress(created.length);
      }
    } finally {
      if (created.length > 0) {
        setLevels((ls) => mapItems(ls, levelId, (existing) => [...existing, ...created]));
      }
    }
    setNotice(`Added ${created.length} ${created.length === 1 ? "word" : "words"}.`);
  };

  // Course

  const saveSettings = async (values: CourseFormValues) => {
    const updated = await api.updateCourse(course.id, values);
    setCourse(updated);
  };

  const deleteCourse = () =>
    run(async () => {
      await api.deleteCourse(course.id);
      router.push("/");
    });

  return (
    <>
      <Header />

      <div className="bg-ink-soft text-white">
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:pt-6">
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white/70 hover:text-white"
          >
            Back to course
          </Link>
          <div className="mt-1 flex items-center gap-3 sm:mt-3 sm:gap-4">
            <LanguageTile code={course.target_lang} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold sm:text-2xl">{course.title}</h1>
              <p className="text-white/70">
                {totalWords} {totalWords === 1 ? "word" : "words"} in {levels.length}{" "}
                {levels.length === 1 ? "level" : "levels"}
              </p>
            </div>
          </div>
          <div role="tablist" aria-label="Editor sections" className="mt-4 flex gap-1 sm:mt-6">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 flex-1 rounded-t-lg px-4 py-2.5 font-bold sm:flex-none ${
                  tab === t.id ? "bg-paper text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:py-8">
        {error ? (
          <p role="alert" className="mb-4 rounded-lg bg-berry/10 px-4 py-3 font-semibold text-berry">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="mb-4 rounded-lg bg-leaf/10 px-4 py-3 font-semibold text-leaf-dark">
            {notice}
          </p>
        ) : null}

        {tab === "words" ? (
          <div className="flex flex-col gap-4">
            {levels.map((level, i) => (
              <LevelPanel
                key={level.id}
                level={level}
                number={i + 1}
                sourceLabel={sourceLabel}
                targetLabel={targetLabel}
                lang={course.target_lang}
                onRename={(title) => renameLevel(level.id, title)}
                onDelete={() => deleteLevel(level.id)}
                onCreateItem={(input) => createItem(level.id, input)}
                onUpdateItem={(itemId, changes) => updateItem(level.id, itemId, changes)}
                onDeleteItem={(itemId) => deleteItem(level.id, itemId)}
                onImport={(items, onProgress) => importItems(level.id, items, onProgress)}
              />
            ))}
            <AddLevelForm nextNumber={levels.length + 1} onAdd={addLevel} />
          </div>
        ) : (
          <div className="max-w-2xl">
            <CourseForm initial={toFormValues(course)} submitLabel="Save changes" onSubmit={saveSettings} />
            <section className="mt-12 rounded-xl border-2 border-berry/30 bg-white p-5">
              <h2 className="text-lg font-extrabold">Delete this course</h2>
              <p className="mt-1 text-sm text-ink/70">
                This removes every level, word and review history in the course. It can&apos;t be undone.
              </p>
              <ConfirmButton
                label="Delete course"
                confirmLabel="Click again to delete"
                onConfirm={deleteCourse}
                className="mt-4"
              />
            </section>
          </div>
        )}
      </main>
    </>
  );
}

// Loader

export function CourseEditor({ courseId }: { courseId: string }) {
  const load = useCallback(() => api.course(courseId), [courseId]);
  const { state, reload } = useAsync(load);

  if (state.status === "ready" && state.data.is_owner) {
    return <EditorBody key={state.data.id} initial={state.data} />;
  }

  if (state.status === "ready") {
    return (
      <>
        <Header />
        <StatusMessage
          title="You can only edit your own courses"
          action={
            <Link href={`/courses/${state.data.id}`} className="rounded-lg bg-ink px-4 py-2 font-bold text-white">
              Back to course
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <Header />
      {state.status === "loading" ? (
        <StatusMessage title="Loading the editor" />
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