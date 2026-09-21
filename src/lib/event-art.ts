import throneArt from "@/assets/sawtak-throne-event.jpg";
import diamondRace from "@/assets/event-diamond-race.jpg";
import royalNight from "@/assets/event-royal-night.jpg";
import giftStorm from "@/assets/event-gift-storm.jpg";
import coinVault from "@/assets/event-coin-vault.jpg";
import roomLegend from "@/assets/event-room-legend.jpg";

/** صور الأحداث المرفقة داخل التطبيق — يُخزَّن المفتاح فقط في قاعدة البيانات. */
const ART: Record<string, string> = {
  throne: throneArt,
  "diamond-race": diamondRace,
  "royal-night": royalNight,
  "gift-storm": giftStorm,
  "coin-vault": coinVault,
  "room-legend": roomLegend,
};

/** يحوّل قيمة image_url إلى صورة حقيقية: مفتاح داخلي أو رابط خارجي. */
export function eventArt(imageUrl: string | null | undefined): string {
  if (!imageUrl) return throneArt;
  if (ART[imageUrl]) return ART[imageUrl] as string;
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  return throneArt;
}

/** تصميم مستقل لكل حدث حسب مفتاح style المخزَّن في قاعدة البيانات. */
export type EventStyle = {
  label: string;
  card: string;
  ring: string;
  chip: string;
  glow: string;
  bar: string;
  fallback: string;
};

const STYLES: Record<string, EventStyle> = {
  royal: {
    label: "ملكي ذهبي",
    card: "from-amber-500/25 via-amber-900/15 to-[#120b24] border-amber-400/40",
    ring: "ring-2 ring-amber-300/70",
    chip: "border-amber-300/50 bg-amber-400/15 text-amber-200",
    glow: "shadow-[0_0_28px_-6px_rgba(251,191,36,0.55)]",
    bar: "bg-gradient-to-r from-amber-200 to-amber-500",
    fallback: throneArt,
  },
  rose: {
    label: "وردي نجوم",
    card: "from-rose-500/25 via-rose-900/15 to-[#1a0b18] border-rose-400/40",
    ring: "ring-2 ring-rose-300/70",
    chip: "border-rose-300/50 bg-rose-400/15 text-rose-200",
    glow: "shadow-[0_0_28px_-6px_rgba(244,114,182,0.55)]",
    bar: "bg-gradient-to-r from-rose-200 to-rose-500",
    fallback: royalNight,
  },
  ocean: {
    label: "أزرق محيطي",
    card: "from-sky-500/25 via-sky-900/15 to-[#08182a] border-sky-400/40",
    ring: "ring-2 ring-sky-300/70",
    chip: "border-sky-300/50 bg-sky-400/15 text-sky-200",
    glow: "shadow-[0_0_28px_-6px_rgba(56,189,248,0.55)]",
    bar: "bg-gradient-to-r from-sky-200 to-sky-500",
    fallback: giftStorm,
  },
  violet: {
    label: "بنفسجي ألماسي",
    card: "from-violet-500/25 via-violet-900/15 to-[#140b2a] border-violet-400/40",
    ring: "ring-2 ring-violet-300/70",
    chip: "border-violet-300/50 bg-violet-400/15 text-violet-200",
    glow: "shadow-[0_0_28px_-6px_rgba(167,139,250,0.55)]",
    bar: "bg-gradient-to-r from-violet-200 to-violet-500",
    fallback: diamondRace,
  },
  emerald: {
    label: "زمردي",
    card: "from-emerald-500/25 via-emerald-900/15 to-[#06201a] border-emerald-400/40",
    ring: "ring-2 ring-emerald-300/70",
    chip: "border-emerald-300/50 bg-emerald-400/15 text-emerald-200",
    glow: "shadow-[0_0_28px_-6px_rgba(52,211,153,0.55)]",
    bar: "bg-gradient-to-r from-emerald-200 to-emerald-500",
    fallback: roomLegend,
  },
  fire: {
    label: "عاصفة نارية",
    card: "from-orange-500/25 via-red-900/20 to-[#210b0b] border-orange-400/40",
    ring: "ring-2 ring-orange-300/70",
    chip: "border-orange-300/50 bg-orange-400/15 text-orange-200",
    glow: "shadow-[0_0_28px_-6px_rgba(251,146,60,0.6)]",
    bar: "bg-gradient-to-r from-orange-200 to-red-500",
    fallback: coinVault,
  },
};

export function eventStyle(key: string | null | undefined): EventStyle {
  return STYLES[key ?? "royal"] ?? (STYLES["royal"] as EventStyle);
}
