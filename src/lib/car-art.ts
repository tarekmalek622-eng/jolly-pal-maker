import arrow from "@/assets/car-silver-star.png";
import wing from "@/assets/car-blue-roundel.png";
import suv from "@/assets/car-green-oval.png";
import flags from "@/assets/car-red-oval.png";
import bolt from "@/assets/car-purple-bolt.png";
import lion from "@/assets/car-black-lion.png";
import horse from "@/assets/car-gold-horse.png";
import diamond from "@/assets/car-white-diamond.png";
import crown from "@/assets/car-gold-crown.png";
import shield from "@/assets/car-royal-shield.png";

const ART: Record<string, string> = {
  arrow,
  wing,
  suv,
  flags,
  bolt,
  lion,
  horse,
  diamond,
  crown,
  shield,
};

/** شعار السيارة لخانة معيّنة، أو null إذا لم توجد صورة */
export function carArt(key: string | null | undefined): string | null {
  if (!key) return null;
  return ART[key] ?? null;
}
