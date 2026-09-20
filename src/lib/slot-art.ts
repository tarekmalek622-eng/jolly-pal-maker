import seven from "@/assets/slot/seven.png";
import diamond from "@/assets/slot/diamond.png";
import star from "@/assets/slot/star.png";
import bell from "@/assets/slot/bell.png";
import lemon from "@/assets/slot/lemon.png";
import cherry from "@/assets/slot/cherry.png";

/** رموز لعبة 77 بصور حقيقية — المفتاح هو الإيموجي الذي يرسله السيرفر. */
const ART: Record<string, string> = {
  "7️⃣": seven,
  "💎": diamond,
  "⭐": star,
  "🔔": bell,
  "🍋": lemon,
  "🍒": cherry,
};

export function slotArt(face: string): string | null {
  return ART[face] ?? null;
}
