"use client";

import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/ProgressBar";

type Props = {
  courseId: string;
  done: number;
  total: number;
};

export function SessionTopBar({ courseId, done, total }: Props) {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-4 sm:px-4 sm:py-4">
      <button
        type="button"
        onClick={() => router.replace(`/courses/${courseId}`)}
        aria-label="End session"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/5 hover:text-ink"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <ProgressBar value={total === 0 ? 0 : done / total} color="bg-sun" className="h-3 flex-1" label="Session progress" />
      <span className="min-w-12 pr-2 text-right text-sm font-bold tabular-nums text-ink/50 sm:pr-0">
        {done}/{total}
      </span>
    </div>
  );
}