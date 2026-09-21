export type FamilyStyle = {
  key: string;
  label: string;
  ring: string;
  card: string;
  badge: string;
  glow: string;
};

const STYLES: Record<string, FamilyStyle> = {
  bronze: {
    key: "bronze",
    label: "برونزي",
    ring: "ring-2 ring-amber-700/50",
    card: "from-amber-900/30 to-amber-700/10",
    badge: "bg-amber-800/30 text-amber-200 border-amber-700/50",
    glow: "shadow-[0_8px_24px_-12px_rgba(180,83,9,0.7)]",
  },
  silver: {
    key: "silver",
    label: "فضي",
    ring: "ring-2 ring-slate-300/50",
    card: "from-slate-400/25 to-slate-200/5",
    badge: "bg-slate-300/20 text-slate-100 border-slate-300/50",
    glow: "shadow-[0_8px_24px_-12px_rgba(203,213,225,0.6)]",
  },
  blue: {
    key: "blue",
    label: "أزرق",
    ring: "ring-2 ring-sky-400/60",
    card: "from-sky-600/30 to-sky-400/5",
    badge: "bg-sky-500/20 text-sky-100 border-sky-400/50",
    glow: "shadow-[0_8px_26px_-12px_rgba(56,189,248,0.7)]",
  },
  purple: {
    key: "purple",
    label: "بنفسجي",
    ring: "ring-2 ring-violet-400/60",
    card: "from-violet-600/30 to-fuchsia-500/10",
    badge: "bg-violet-500/20 text-violet-100 border-violet-400/50",
    glow: "shadow-[0_8px_26px_-12px_rgba(167,139,250,0.7)]",
  },
  gold: {
    key: "gold",
    label: "ذهبي",
    ring: "ring-2 ring-yellow-300/70",
    card: "from-yellow-500/30 to-amber-300/10",
    badge: "bg-yellow-400/20 text-yellow-100 border-yellow-300/60",
    glow: "shadow-[0_10px_30px_-12px_rgba(253,224,71,0.8)]",
  },
  royal: {
    key: "royal",
    label: "ملكي",
    ring: "ring-2 ring-rose-300/70",
    card: "from-rose-600/30 via-amber-400/15 to-rose-400/10",
    badge: "bg-rose-500/20 text-rose-100 border-rose-300/60",
    glow: "shadow-[0_10px_32px_-12px_rgba(251,113,133,0.8)]",
  },
  legend: {
    key: "legend",
    label: "أسطوري",
    ring: "ring-2 ring-amber-200/90",
    card: "from-amber-300/35 via-yellow-200/20 to-orange-400/15",
    badge: "bg-amber-200/25 text-amber-50 border-amber-200/80",
    glow: "shadow-[0_14px_40px_-10px_rgba(252,211,77,0.95)]",
  },
};

export function familyStyle(key?: string | null): FamilyStyle {
  return STYLES[key ?? "bronze"] ?? STYLES["bronze"]!;
}

export const FAMILY_ROLE_LABEL: Record<string, string> = {
  leader: "قائد العائلة",
  deputy: "نائب",
  member: "عضو",
};
