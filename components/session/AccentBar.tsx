type Props = {
  chars: string[];
  disabled: boolean;
  onInsert: (char: string) => void;
};

export function AccentBar({ chars, disabled, onInsert }: Props) {
  return (
    <div
      className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
      aria-label="Special characters"
    >
      {chars.map((char) => (
        <button
          key={char}
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(char)}
          className="h-11 min-w-11 shrink-0 rounded-md border border-ink/15 bg-white px-2 text-lg font-bold hover:border-water hover:bg-water/5 disabled:opacity-40"
        >
          {char}
        </button>
      ))}
    </div>
  );
}