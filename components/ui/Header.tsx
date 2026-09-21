import Link from "next/link";
import { APP_NAME, DEV_TOOLS } from "@/lib/client/config";
import { DevTimeTravel } from "./DevTimeTravel";
import { FlowerIcon, PlusIcon } from "./icons";

export function Header() {
  return (
    <header className="bg-ink pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-extrabold tracking-tight">
          <FlowerIcon className="h-6 w-6 text-sun" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link
            href="/"
            className="hidden min-h-11 items-center rounded-lg px-3 text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            Courses
          </Link>
          <Link
            href="/courses/new"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <PlusIcon className="h-4 w-4" />
            New course
          </Link>
          <div className="ml-2 hidden md:block">
            <DevTimeTravel />
          </div>
        </nav>
      </div>
      {DEV_TOOLS ? (
        <div className="border-t border-white/10 md:hidden">
          <div className="mx-auto flex max-w-5xl justify-center px-4 py-1.5">
            <DevTimeTravel />
          </div>
        </div>
      ) : null}
    </header>
  );
}