type Props = {
  value: number;
  color?: string;
  className?: string;
  label?: string;
};

export function ProgressBar({ value, color = "bg-leaf", className = "", label = "Progress" }: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`h-2.5 overflow-hidden rounded-full bg-ink/10 ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}