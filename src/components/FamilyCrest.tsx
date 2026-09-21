import { cn } from "@/lib/utils";

const PALETTE: Record<string, { from: string; to: string; ink: string }> = {
  bronze: { from: "#8a4b12", to: "#d08a3a", ink: "#fff5e6" },
  silver: { from: "#5f6b7a", to: "#d7dee8", ink: "#1b2430" },
  blue: { from: "#0b4a8f", to: "#4fb8f7", ink: "#ecf8ff" },
  purple: { from: "#4c1d95", to: "#c084fc", ink: "#faf5ff" },
  gold: { from: "#8a5a00", to: "#fcd34d", ink: "#2b1a00" },
  royal: { from: "#7f1d3a", to: "#fbbf76", ink: "#fff3e6" },
  legend: { from: "#b45309", to: "#fde68a", ink: "#3b2300" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "ع";
  const second = parts[1]?.[0] ?? "";
  return (first + second).slice(0, 2);
}

/**
 * Family logo: shows the uploaded logo when present, otherwise draws an
 * inline crest (no network request) based on the family level style.
 */
export function FamilyCrest({
  name,
  logoUrl,
  styleKey,
  level = 1,
  size = 46,
  className,
}: {
  name: string;
  logoUrl?: string | null | undefined;
  styleKey?: string | null | undefined;
  level?: number;
  size?: number;
  className?: string | undefined;
}) {
  const p = PALETTE[styleKey ?? "bronze"] ?? PALETTE["bronze"]!;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 rounded-2xl object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const id = (styleKey ?? "bronze") + "-crest";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={name}
      className={cn("shrink-0 rounded-2xl", className)}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>
      <path
        d="M32 2 58 10v26c0 12-11 21-26 26C17 57 6 48 6 36V10L32 2Z"
        fill={`url(#${id})`}
        stroke={p.to}
        strokeWidth="1.5"
      />
      <path d="M32 8 52 14v21c0 9-8 16-20 20-12-4-20-11-20-20V14L32 8Z" fill="rgba(0,0,0,0.18)" />
      {level >= 6 && (
        <path d="M22 20l6 5 4-8 4 8 6-5-2 10H24l-2-10Z" fill={p.ink} opacity="0.9" />
      )}
      <text
        x="32"
        y={level >= 6 ? 47 : 41}
        textAnchor="middle"
        fontSize="18"
        fontWeight="900"
        fill={p.ink}
        fontFamily="inherit"
      >
        {initials(name)}
      </text>
    </svg>
  );
}
