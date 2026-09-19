type IconProps = { className?: string };

// Garden

export function SeedIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="15" rx="5" ry="6.5" fill="currentColor" />
      <path d="M12 8.5c0-2.6 1.5-4.6 3.6-5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function SproutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 22V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 14C12 9.8 9 7.5 4.5 7.5c0 4.2 3 6.5 7.5 6.5Z" fill="currentColor" />
      <path d="M12 11.5c0-4.5 3-7 7.5-7 0 4.5-3 7-7.5 7Z" fill="currentColor" />
    </svg>
  );
}

export function FlowerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 22v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="4.6" r="3" fill="currentColor" />
      <circle cx="16.9" cy="8.2" r="3" fill="currentColor" />
      <circle cx="15" cy="13.8" r="3" fill="currentColor" />
      <circle cx="9" cy="13.8" r="3" fill="currentColor" />
      <circle cx="7.1" cy="8.2" r="3" fill="currentColor" />
      <circle cx="12" cy="9.5" r="2.4" fill="white" />
    </svg>
  );
}

export function DropIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.5c3.6 4.6 6.2 8 6.2 11.3a6.2 6.2 0 0 1-12.4 0C5.8 10.5 8.4 7.1 12 2.5Z" fill="currentColor" />
    </svg>
  );
}

// Controls

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}