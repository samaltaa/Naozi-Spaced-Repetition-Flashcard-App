type Props = {
  chars: string[];
  disabled: boolean;
  onInsert: (char: string) => void;
};

export function AccentBar({ chars, disabled, onInsert }: Props) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-1.5" aria-label="Special characters">
      {chars.map((char) => (
        <button
          key={char}
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(char)}
          className="h-10 min-w-10 rounded-md border border-ink/15 bg-white px-2 text-lg font-bold hover:border-water hover:bg-water/5 disabled:opacity-40"
        >
          {char}
        </button>
      ))}
    </div>
  );
}