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
