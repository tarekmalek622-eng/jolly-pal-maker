import vipBadge1 from "@/assets/vip-badge-1.png";
import vipBadge2 from "@/assets/vip-badge-2.png";
import vipBadge3 from "@/assets/vip-badge-3.png";
import vipBadge4 from "@/assets/vip-badge-4.png";
import vipBadge5 from "@/assets/vip-badge-5.png";
import vipBadge6 from "@/assets/vip-badge-6.png";
import vipBadge7 from "@/assets/vip-badge-7.png";
import vipBadge8 from "@/assets/vip-badge-8.png";
import vipFrame1 from "@/assets/vip-frame-1.png";
import vipFrame2 from "@/assets/vip-frame-2.png";
import vipFrame3 from "@/assets/vip-frame-3.png";
import vipFrame4 from "@/assets/vip-frame-4.png";
import vipFrame5 from "@/assets/vip-frame-5.png";
import vipFrame6 from "@/assets/vip-frame-6.png";
import vipFrame7 from "@/assets/vip-frame-7.png";
import vipFrame8 from "@/assets/vip-frame-8.png";

export const VIP_FRAMES = [vipFrame1, vipFrame2, vipFrame3, vipFrame4, vipFrame5, vipFrame6, vipFrame7, vipFrame8] as const;

export const VIP_NAMES = [
  "النخبة الفضية",
  "النخبة الملكية",
  "الأمير الياقوتي",
  "الملك الزمردي",
  "الأسطورة الذهبية",
  "سيّد السماء",
  "إمبراطور العنقاء",
  "تاج الأبدية",
] as const;

export type VipVisual = {
  tierClass: string;
  nameClass: string;
  frameClass: string;
  badgeClass: string;
  entryLabel: string;
};

const VIP_VISUALS: Record<number, VipVisual> = {
  1: { tierClass: "vip-tier-1", nameClass: "text-gradient-gold", frameClass: "animate-frame-glow", badgeClass: "vip-badge-1", entryLabel: "دخول النخبة" },
  2: { tierClass: "vip-tier-2", nameClass: "text-gradient-gold", frameClass: "animate-frame-glow", badgeClass: "vip-badge-2", entryLabel: "دخول ملكي" },
  3: { tierClass: "vip-tier-3", nameClass: "text-gradient-gold", frameClass: "animate-frame-fire", badgeClass: "vip-badge-3", entryLabel: "دخول ياقوتي" },
  4: { tierClass: "vip-tier-4", nameClass: "text-vip-flow", frameClass: "animate-frame-glow", badgeClass: "vip-badge-4", entryLabel: "دخول زمردي" },
  5: { tierClass: "vip-tier-5", nameClass: "text-vip-flow", frameClass: "animate-frame-glow", badgeClass: "vip-badge-5", entryLabel: "دخول الأسطورة" },
  6: { tierClass: "vip-tier-6", nameClass: "text-vip-celestial", frameClass: "animate-frame-celestial", badgeClass: "vip-badge-6", entryLabel: "موكب السماء" },
  7: { tierClass: "vip-tier-7", nameClass: "text-vip-phoenix", frameClass: "animate-frame-phoenix", badgeClass: "vip-badge-7", entryLabel: "موكب العنقاء" },
  8: { tierClass: "vip-tier-8", nameClass: "text-vip-eternal", frameClass: "animate-frame-eternal", badgeClass: "vip-badge-8", entryLabel: "موكب تاج الأبدية" },
};

export function getVipVisual(level: number): VipVisual | null {
  if (level < 1) return null;
  return VIP_VISUALS[Math.min(8, level)] ?? VIP_VISUALS[8] ?? null;
}

export function getVipFrame(level: number) {
  if (level < 1) return null;
  return VIP_FRAMES[Math.min(8, level) - 1] ?? VIP_FRAMES[7];
}

export function getVipName(level: number) {
  if (level < 1) return "عضو";
  return VIP_NAMES[Math.min(8, level) - 1] ?? VIP_NAMES[7];
}
export const VIP_BADGES = [
  vipBadge1,
  vipBadge2,
  vipBadge3,
  vipBadge4,
  vipBadge5,
  vipBadge6,
  vipBadge7,
  vipBadge8,
] as const;

export function getVipBadgeArt(level: number) {
  if (level < 1) return null;
  return VIP_BADGES[Math.min(8, level) - 1] ?? VIP_BADGES[7];
}
