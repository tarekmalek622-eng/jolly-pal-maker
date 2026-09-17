import vipFrame1 from "@/assets/vip-frame-1.png";
import vipFrame2 from "@/assets/vip-frame-2.png";
import vipFrame3 from "@/assets/vip-frame-3.png";
import vipFrame4 from "@/assets/vip-frame-4.png";
import vipFrame5 from "@/assets/vip-frame-5.png";

export const VIP_FRAMES = [vipFrame1, vipFrame2, vipFrame3, vipFrame4, vipFrame5] as const;

export const VIP_NAMES = ["النخبة الفضية", "النخبة الملكية", "الأمير الياقوتي", "الملك الزمردي", "الأسطورة الذهبية"] as const;

export function getVipFrame(level: number) {
  if (level < 1) return null;
  return VIP_FRAMES[Math.min(5, level) - 1] ?? VIP_FRAMES[4];
}

export function getVipName(level: number) {
  if (level < 1) return "عضو";
  return VIP_NAMES[Math.min(5, level) - 1] ?? VIP_NAMES[4];
}