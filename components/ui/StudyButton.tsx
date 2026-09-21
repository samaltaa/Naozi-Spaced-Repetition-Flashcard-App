import Link from "next/link";
import { DropIcon, SeedIcon } from "./icons";

type Props = {
  href: string;
  kind: "learn" | "review";
  label: string;
  shortLabel?: string;
  disabled?: boolean;
  size?: "md" | "lg";
  fullWidth?: boolean;
};

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] active:translate-y-px active:shadow-none";

const SIZES = {
  md: "min-h-11 px-4 py-2 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

const TONES = {
  learn: "bg-leaf hover:bg-leaf-dark",
  review: "bg-water hover:bg-water-dark",
};

export function StudyButton({ href, kind, label, shortLabel, disabled = false, size = "md", fullWidth = false }: Props) {
  const Icon = kind === "learn" ? SeedIcon : DropIcon;
  const className = `${BASE} ${SIZES[size]} ${fullWidth ? "w-full sm:w-auto" : ""}`;
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </>
  );

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${className} cursor-not-allowed bg-ink/25 shadow-none`}>
        {content}
      </span>
    );
  }

  return (
    <Link href={href} className={`${className} ${TONES[kind]}`}>
      {content}
    </Link>
  );
}