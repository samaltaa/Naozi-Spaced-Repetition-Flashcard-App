import Link from "next/link";
import { DropIcon, SeedIcon } from "./icons";

type Props = {
  href: string;
  kind: "learn" | "review";
  label: string;
  disabled?: boolean;
  size?: "md" | "lg";
};

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.18)] active:translate-y-px active:shadow-none";

const SIZES = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
};

const TONES = {
  learn: "bg-leaf hover:bg-leaf-dark",
  review: "bg-water hover:bg-water-dark",
};

export function StudyButton({ href, kind, label, disabled = false, size = "md" }: Props) {
  const Icon = kind === "learn" ? SeedIcon : DropIcon;
  const className = `${BASE} ${SIZES[size]}`;

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${className} cursor-not-allowed bg-ink/25 shadow-none`}>
        <Icon className="h-4 w-4" />
        {label}
      </span>
    );
  }

  return (
    <Link href={href} className={`${className} ${TONES[kind]}`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}