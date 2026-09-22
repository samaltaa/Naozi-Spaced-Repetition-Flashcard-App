import Link from "next/link";
import type { ReactNode } from "react";
import { FlowerIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/client/config";

// Styles

export const AUTH_INPUT =
  "min-h-12 w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-base font-semibold outline-none focus:border-water";
export const AUTH_LABEL = "mb-1 block text-sm font-bold";
export const AUTH_SUBMIT =
  "min-h-12 w-full rounded-lg bg-leaf px-6 py-3 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] hover:bg-leaf-dark disabled:opacity-60";
export const AUTH_LINK = "inline-flex min-h-11 items-center font-bold text-water hover:underline";

// Shell

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="bg-ink pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link href="/" className="flex min-h-11 items-center gap-2 text-xl font-extrabold tracking-tight">
            <FlowerIcon className="h-6 w-6 text-sun" />
            {APP_NAME}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-ink/70">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm text-ink/70">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

// Messages

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-berry/10 px-3 py-2 text-sm font-semibold text-berry">
      {message}
    </p>
  );
}