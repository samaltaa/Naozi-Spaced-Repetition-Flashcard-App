import Link from "next/link";
import { APP_NAME } from "@/lib/client/config";
import { DevTimeTravel } from "./DevTimeTravel";
import { FlowerIcon } from "./icons";

export function Header() {
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
          <FlowerIcon className="h-6 w-6 text-sun" />
          {APP_NAME}
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/" className="text-white/80 hover:text-white">
            Courses
          </Link>
          <Link href="/courses/new" className="text-white/80 hover:text-white">
            New course
          </Link>
          <DevTimeTravel />
        </nav>
      </div>
    </header>
  );
}