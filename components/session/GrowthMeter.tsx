import { FlowerIcon, SeedIcon, SproutIcon } from "@/components/ui/icons";

type Props = {
  stage: number;
  steps?: number;
};

export function GrowthMeter({ stage, steps = 3 }: Props) {
  const Icon = stage >= steps ? FlowerIcon : stage >= 1 ? SproutIcon : SeedIcon;

  return (
    <div className="mb-6 flex items-center justify-center gap-3" aria-label={`Learning progress: ${stage} of ${steps}`}>
      <Icon className={`h-8 w-8 ${stage >= steps ? "text-sun" : "text-leaf"}`} />
      <div className="flex gap-1.5">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={`h-2 w-7 rounded-full ${i < stage ? "bg-leaf" : "bg-ink/15"}`} />
        ))}
      </div>
    </div>
  );
}