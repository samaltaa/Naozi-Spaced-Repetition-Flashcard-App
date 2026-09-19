"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/client/api";
import { DEFAULT_COURSE } from "@/lib/client/editor";
import type { CourseFormValues } from "@/lib/client/types";
import { CourseForm } from "./CourseForm";

export function NewCourseView() {
  const router = useRouter();

  const create = async (values: CourseFormValues) => {
    const course = await api.createCourse(values);
    await api.createLevel(course.id, { title: "Level 1" });
    router.push(`/courses/${course.id}/edit`);
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-ink/60 hover:text-ink">
          Back to courses
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold">Create a course</h1>
        <p className="mt-1 text-ink/70">Set up the basics. You&apos;ll add levels and words on the next screen.</p>
        <div className="mt-8">
          <CourseForm initial={DEFAULT_COURSE} submitLabel="Create course" onSubmit={create} />
        </div>
      </main>
    </>
  );
}