import { cn } from "@/lib/utils";

/** The TrueMerit mark — balanced scales drawn in an emerald→gold gradient. */
export function MeritMark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="tm-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0C1420" />
          <stop offset="1" stopColor="#080D15" />
        </linearGradient>
        <linearGradient id="tm-g" x1="14" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399" />
          <stop offset="0.55" stopColor="#10B981" />
          <stop offset="1" stopColor="#E5B84B" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#tm-bg)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" stroke="rgba(148,163,184,0.22)" />
      {/* beam */}
      <line x1="17" y1="21" x2="47" y2="21" stroke="url(#tm-g)" strokeWidth="3.6" strokeLinecap="round" />
      {/* finial + post */}
      <circle cx="32" cy="16.5" r="3" fill="url(#tm-g)" />
      <line x1="32" y1="19" x2="32" y2="45" stroke="url(#tm-g)" strokeWidth="3.6" strokeLinecap="round" />
      {/* base */}
      <line x1="24" y1="48.5" x2="40" y2="48.5" stroke="url(#tm-g)" strokeWidth="3.6" strokeLinecap="round" />
      {/* left pan */}
      <path d="M10.5 24 L17 35 L23.5 24" stroke="url(#tm-g)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="17" y1="21" x2="17" y2="23.2" stroke="url(#tm-g)" strokeWidth="2.4" />
      {/* right pan */}
      <path d="M40.5 24 L47 35 L53.5 24" stroke="url(#tm-g)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="47" y1="21" x2="47" y2="23.2" stroke="url(#tm-g)" strokeWidth="2.4" />
    </svg>
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <MeritMark size={34} className="drop-shadow-[0_4px_16px_rgba(16,185,129,0.35)]" />
      {!compact && (
        <span className="font-display text-[19px] font-bold tracking-tight leading-none">
          True<span className="text-gradient-gold">Merit</span>
        </span>
      )}
    </span>
  );
}

/** Standalone advisory chip used across all AI surfaces. */
export function AiChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300",
        className
      )}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l1.9 5.7L20 9.6l-5 3.8 1.6 6.1L12 16l-4.6 3.5L9 13.4 4 9.6l6.1-1.9L12 2z" fill="currentColor" />
      </svg>
      AI assists · Humans decide
    </span>
  );
}
