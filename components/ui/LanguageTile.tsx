const TILES = [
  "bg-leaf text-white",
  "bg-water text-white",
  "bg-sun text-ink",
  "bg-berry text-white",
  "bg-ink-soft text-white",
];

const SIZES = {
  md: "h-16 w-16 text-xl rounded-lg",
  lg: "h-24 w-24 text-3xl rounded-xl",
};

function tileFor(code: string): string {
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILES[hash % TILES.length] ?? TILES[0]!;
}

export function LanguageTile({ code, size = "md" }: { code: string; size?: keyof typeof SIZES }) {
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-extrabold lowercase ${SIZES[size]} ${tileFor(code)}`}
    >
      {code.split("-")[0]}
    </div>
  );
}