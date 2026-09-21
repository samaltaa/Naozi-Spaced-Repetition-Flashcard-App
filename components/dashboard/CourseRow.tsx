import Link from "next/link";
import { LanguageTile } from "@/components/ui/LanguageTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StudyButton } from "@/components/ui/StudyButton";
import { languageName } from "@/lib/client/languages";
import type { DashboardCourse } from "@/lib/client/types";

export function CourseRow({ course }: { course: DashboardCourse }) {
  const progress = course.totalItems === 0 ? 0 : course.learnedCount / course.totalItems;
  const reviewLabel = course.dueCount === 0 ? "Nothing to review" : `Review ${course.dueCount}`;

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-white p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <LanguageTile code={course.targetLang} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/courses/${course.courseId}`}
              className="min-w-0 break-words text-lg font-extrabold leading-tight hover:underline"
            >
              {course.title}
            </Link>
            <Link
              href={`/courses/${course.courseId}/edit`}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-water hover:bg-water/5"
            >
              Edit
            </Link>
          </div>
          <p className="text-sm text-ink/60">
            {languageName(course.targetLang)}, {course.learnedCount} of {course.totalItems} learned
          </p>
          <ProgressBar value={progress} className="mt-2" label={`${course.title} progress`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
        <StudyButton
          href={`/courses/${course.courseId}/learn`}
          kind="learn"
          label="Learn new words"
          shortLabel="Learn"
          disabled={course.newAvailable === 0}
          fullWidth
        />
        <StudyButton
          href={`/courses/${course.courseId}/review`}
          kind="review"
          label={reviewLabel}
          shortLabel={course.dueCount === 0 ? "No reviews" : reviewLabel}
          disabled={course.dueCount === 0}
          fullWidth
        />
      </div>
    </li>
  );
}