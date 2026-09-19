import Link from "next/link";
import { CloseIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/ProgressBar";

type Props = {
  courseId: string;
  done: number;
  total: number;
};

export function SessionTopBar({ courseId, done, total }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-4">
      <Link
        href={`/courses/${courseId}`}
        aria-label="End session"
        className="rounded-full p-2 text-ink/50 hover:bg-ink/5 hover:text-ink"
      >
        <CloseIcon className="h-5 w-5" />
      </Link>
      <ProgressBar value={total === 0 ? 0 : done / total} color="bg-sun" className="h-3 flex-1" label="Session progress" />
      <span className="min-w-12 text-right text-sm font-bold tabular-nums text-ink/50">
        {done}/{total}
      </span>
    </div>
  );
}