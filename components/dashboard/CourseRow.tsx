import Link from "next/link";
import { LanguageTile } from "@/components/ui/LanguageTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StudyButton } from "@/components/ui/StudyButton";
import { languageName } from "@/lib/client/languages";
import type { DashboardCourse } from "@/lib/client/types";

export function CourseRow({ course }: { course: DashboardCourse }) {
  const progress = course.totalItems === 0 ? 0 : course.learnedCount / course.totalItems;

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-white p-4 sm:flex-row sm:items-center">
      <LanguageTile code={course.targetLang} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link href={`/courses/${course.courseId}`} className="text-lg font-extrabold hover:underline">
            {course.title}
          </Link>
          <Link
            href={`/courses/${course.courseId}/edit`}
            className="text-sm font-bold text-water hover:underline"
          >
            Edit
          </Link>
        </div>
        <p className="text-sm text-ink/60">
          {languageName(course.targetLang)}, {course.learnedCount} of {course.totalItems} words learned
        </p>
        <ProgressBar value={progress} className="mt-2" label={`${course.title} progress`} />
      </div>

      <div className="flex gap-2 sm:flex-col">
        <StudyButton
          href={`/courses/${course.courseId}/learn`}
          kind="learn"
          label="Learn new words"
          disabled={course.newAvailable === 0}
        />
        <StudyButton
          href={`/courses/${course.courseId}/review`}
          kind="review"
          label={course.dueCount === 0 ? "Nothing to review" : `Review ${course.dueCount}`}
          disabled={course.dueCount === 0}
        />
      </div>
    </li>
  );
}