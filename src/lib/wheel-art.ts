import tomato from "@/assets/wheel/tomato.png";
import carrot from "@/assets/wheel/carrot.png";
import corn from "@/assets/wheel/corn.png";
import cabbage from "@/assets/wheel/cabbage.png";
import chicken from "@/assets/wheel/chicken.png";
import fish from "@/assets/wheel/fish.png";
import meat from "@/assets/wheel/meat.png";
import lobster from "@/assets/wheel/lobster.png";

const ART: Record<string, string> = {
  tomato,
  carrot,
  corn,
  cabbage,
  chicken,
  fish,
  meat,
  lobster,
};

/** Premium image for a wheel slot key, or null when no artwork exists. */
export function wheelArt(key: string | null | undefined): string | null {
  if (!key) return null;
  return ART[key] ?? null;
}
