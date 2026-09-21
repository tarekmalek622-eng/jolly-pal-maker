export type StoreArt = {
  grad: string;
  ring: string;
  glow: string;
  chip: string;
};

const ART: Record<string, StoreArt> = {
  aurora: { grad: "from-emerald-400/70 via-sky-500/60 to-indigo-600/70", ring: "ring-emerald-300/50", glow: "shadow-[0_0_28px_-6px_rgba(16,185,129,0.6)]", chip: "bg-emerald-500/20 text-emerald-100" },
  ember: { grad: "from-amber-400/70 via-orange-500/70 to-red-600/70", ring: "ring-orange-300/50", glow: "shadow-[0_0_28px_-6px_rgba(249,115,22,0.6)]", chip: "bg-orange-500/20 text-orange-100" },
  frost: { grad: "from-sky-200/70 via-cyan-400/60 to-blue-600/70", ring: "ring-sky-200/60", glow: "shadow-[0_0_28px_-6px_rgba(56,189,248,0.6)]", chip: "bg-sky-500/20 text-sky-100" },
  royal: { grad: "from-yellow-300/80 via-amber-500/70 to-yellow-700/70", ring: "ring-amber-200/70", glow: "shadow-[0_0_30px_-6px_rgba(251,191,36,0.7)]", chip: "bg-amber-500/25 text-amber-100" },
  neon: { grad: "from-lime-300/70 via-emerald-400/70 to-teal-600/70", ring: "ring-lime-200/60", glow: "shadow-[0_0_28px_-6px_rgba(163,230,53,0.6)]", chip: "bg-lime-500/20 text-lime-100" },
  jade: { grad: "from-emerald-300/70 via-emerald-600/70 to-teal-800/70", ring: "ring-emerald-200/50", glow: "shadow-[0_0_26px_-6px_rgba(5,150,105,0.6)]", chip: "bg-emerald-600/20 text-emerald-100" },
  rose: { grad: "from-pink-300/70 via-rose-500/70 to-fuchsia-700/70", ring: "ring-pink-200/60", glow: "shadow-[0_0_28px_-6px_rgba(244,114,182,0.6)]", chip: "bg-pink-500/20 text-pink-100" },
  void: { grad: "from-slate-700/80 via-slate-900/80 to-black", ring: "ring-slate-400/40", glow: "shadow-[0_0_26px_-6px_rgba(148,163,184,0.5)]", chip: "bg-slate-500/25 text-slate-100" },
  sunset: { grad: "from-orange-300/70 via-pink-500/70 to-purple-700/70", ring: "ring-orange-200/60", glow: "shadow-[0_0_28px_-6px_rgba(236,72,153,0.6)]", chip: "bg-pink-500/20 text-pink-100" },
  ocean: { grad: "from-cyan-300/70 via-blue-600/70 to-indigo-800/70", ring: "ring-cyan-200/60", glow: "shadow-[0_0_28px_-6px_rgba(37,99,235,0.6)]", chip: "bg-blue-500/20 text-blue-100" },
  thunder: { grad: "from-yellow-200/70 via-slate-500/70 to-slate-900/80", ring: "ring-yellow-200/60", glow: "shadow-[0_0_28px_-6px_rgba(250,204,21,0.6)]", chip: "bg-yellow-500/20 text-yellow-100" },
  sand: { grad: "from-amber-100/70 via-amber-300/70 to-amber-700/70", ring: "ring-amber-100/60", glow: "shadow-[0_0_24px_-6px_rgba(217,119,6,0.5)]", chip: "bg-amber-400/20 text-amber-100" },
  blossom: { grad: "from-rose-200/70 via-pink-400/70 to-rose-700/70", ring: "ring-rose-200/60", glow: "shadow-[0_0_26px_-6px_rgba(251,113,133,0.6)]", chip: "bg-rose-500/20 text-rose-100" },
  crimson: { grad: "from-red-400/70 via-red-700/70 to-rose-900/80", ring: "ring-red-300/50", glow: "shadow-[0_0_28px_-6px_rgba(220,38,38,0.6)]", chip: "bg-red-600/25 text-red-100" },
  mint: { grad: "from-teal-200/70 via-emerald-400/60 to-cyan-700/70", ring: "ring-teal-200/60", glow: "shadow-[0_0_24px_-6px_rgba(45,212,191,0.6)]", chip: "bg-teal-500/20 text-teal-100" },
  cosmic: { grad: "from-indigo-400/70 via-purple-700/70 to-slate-900/80", ring: "ring-indigo-300/50", glow: "shadow-[0_0_30px_-6px_rgba(99,102,241,0.6)]", chip: "bg-indigo-500/25 text-indigo-100" },
  pearl: { grad: "from-white/70 via-slate-200/60 to-slate-500/60", ring: "ring-white/70", glow: "shadow-[0_0_26px_-6px_rgba(226,232,240,0.7)]", chip: "bg-slate-200/25 text-white" },
  obsidian: { grad: "from-zinc-600/80 via-zinc-800/80 to-black", ring: "ring-zinc-400/40", glow: "shadow-[0_0_24px_-6px_rgba(113,113,122,0.6)]", chip: "bg-zinc-500/25 text-zinc-100" },
  lagoon: { grad: "from-sky-300/70 via-teal-500/70 to-emerald-800/70", ring: "ring-sky-200/60", glow: "shadow-[0_0_26px_-6px_rgba(20,184,166,0.6)]", chip: "bg-teal-500/20 text-teal-100" },
  magma: { grad: "from-yellow-400/70 via-red-600/70 to-zinc-900/80", ring: "ring-orange-300/60", glow: "shadow-[0_0_30px_-6px_rgba(239,68,68,0.7)]", chip: "bg-red-500/25 text-red-100" },
  lilac: { grad: "from-violet-300/70 via-purple-500/70 to-indigo-700/70", ring: "ring-violet-200/60", glow: "shadow-[0_0_26px_-6px_rgba(167,139,250,0.6)]", chip: "bg-violet-500/20 text-violet-100" },
  gilded: { grad: "from-amber-200/80 via-yellow-500/75 to-amber-800/75", ring: "ring-amber-100/70", glow: "shadow-[0_0_32px_-6px_rgba(245,158,11,0.75)]", chip: "bg-amber-400/25 text-amber-50" },
  steel: { grad: "from-slate-300/70 via-slate-500/70 to-slate-800/80", ring: "ring-slate-200/50", glow: "shadow-[0_0_24px_-6px_rgba(148,163,184,0.6)]", chip: "bg-slate-400/25 text-slate-50" },
  nebula: { grad: "from-fuchsia-400/70 via-indigo-600/70 to-slate-900/80", ring: "ring-fuchsia-300/50", glow: "shadow-[0_0_30px_-6px_rgba(232,121,249,0.6)]", chip: "bg-fuchsia-500/25 text-fuchsia-100" },
  ivy: { grad: "from-green-300/70 via-green-600/70 to-emerald-900/70", ring: "ring-green-200/60", glow: "shadow-[0_0_24px_-6px_rgba(22,163,74,0.6)]", chip: "bg-green-600/20 text-green-100" },
  coral: { grad: "from-orange-200/70 via-rose-400/70 to-pink-700/70", ring: "ring-orange-200/60", glow: "shadow-[0_0_26px_-6px_rgba(251,146,60,0.6)]", chip: "bg-orange-400/20 text-orange-50" },
  dusk: { grad: "from-indigo-300/70 via-slate-600/70 to-slate-900/80", ring: "ring-indigo-200/50", glow: "shadow-[0_0_24px_-6px_rgba(129,140,248,0.6)]", chip: "bg-indigo-400/25 text-indigo-50" },
  dawn: { grad: "from-yellow-200/70 via-orange-300/70 to-sky-500/70", ring: "ring-yellow-100/60", glow: "shadow-[0_0_26px_-6px_rgba(253,224,71,0.6)]", chip: "bg-yellow-300/25 text-yellow-50" },
  storm: { grad: "from-slate-200/70 via-indigo-600/70 to-slate-900/85", ring: "ring-slate-100/50", glow: "shadow-[0_0_30px_-6px_rgba(99,102,241,0.65)]", chip: "bg-indigo-500/25 text-indigo-50" },
  prism: { grad: "from-red-400/60 via-emerald-400/60 to-indigo-500/70", ring: "ring-white/50", glow: "shadow-[0_0_30px_-6px_rgba(255,255,255,0.5)]", chip: "bg-white/20 text-white" },
  halo: { grad: "from-amber-100/75 via-amber-300/70 to-orange-600/70", ring: "ring-amber-100/80", glow: "shadow-[0_0_32px_-6px_rgba(252,211,77,0.8)]", chip: "bg-amber-300/25 text-amber-50" },
  phoenix: { grad: "from-orange-300/75 via-red-500/75 to-amber-800/75", ring: "ring-orange-200/70", glow: "shadow-[0_0_32px_-6px_rgba(251,146,60,0.75)]", chip: "bg-orange-500/25 text-orange-50" },
  dragon: { grad: "from-emerald-400/70 via-teal-700/75 to-zinc-900/80", ring: "ring-emerald-200/60", glow: "shadow-[0_0_30px_-6px_rgba(16,185,129,0.7)]", chip: "bg-emerald-600/25 text-emerald-50" },
  crown: { grad: "from-yellow-200/85 via-amber-400/80 to-yellow-700/80", ring: "ring-yellow-100/80", glow: "shadow-[0_0_34px_-6px_rgba(250,204,21,0.85)]", chip: "bg-yellow-400/30 text-yellow-50" },
};

const CATEGORY_GLYPH: Record<string, string> = {
  profile_frame: "🖼️",
  profile_background: "🌌",
  room_background: "🏛️",
  room_decoration: "🎐",
  mic_decoration: "🎙️",
  badge: "🛡️",
  effect: "✨",
  entry: "🚪",
  name: "🔤",
  chat: "💬",
  special: "👑",
};

export const CATEGORY_LABEL: Record<string, string> = {
  profile_frame: "إطار",
  profile_background: "خلفية بروفايل",
  room_background: "خلفية غرفة",
  room_decoration: "زينة غرفة",
  mic_decoration: "زينة مايك",
  badge: "شارة",
  effect: "مؤثر",
  entry: "دخول",
  name: "اسم",
  chat: "دردشة",
  special: "خاص",
};

export const RARITY_LABEL: Record<string, string> = {
  common: "عادي",
  rare: "نادر",
  epic: "أسطوري",
  legendary: "ملكي",
};

const FALLBACK_BY_CATEGORY: Record<string, string> = {
  profile_frame: "gilded",
  profile_background: "cosmic",
  room_background: "ocean",
  room_decoration: "lilac",
  mic_decoration: "halo",
  badge: "crown",
  effect: "prism",
  entry: "royal",
  name: "neon",
  chat: "lagoon",
  special: "void",
};

export function storeArt(artKey: string | null | undefined, category: string): StoreArt {
  const key = (artKey && ART[artKey] ? artKey : FALLBACK_BY_CATEGORY[category]) ?? "steel";
  return ART[key] ?? ART["steel"]!;
}

export function storeGlyph(category: string): string {
  return CATEGORY_GLYPH[category] ?? "🎁";
}
