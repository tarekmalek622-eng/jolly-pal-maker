import superAdmin from "@/assets/badges/crest-super-admin.png";
import admin from "@/assets/badges/crest-admin.png";
import moderator from "@/assets/badges/crest-moderator.png";
import host from "@/assets/badges/crest-host.png";
import roomOwner from "@/assets/badges/crest-room-owner.png";
import imperial from "@/assets/badges/crest-imperial.png";
import emerald from "@/assets/badges/crest-emerald.png";
import crimson from "@/assets/badges/crest-crimson.png";
import sapphire from "@/assets/badges/crest-sapphire.png";
import gold from "@/assets/badges/crest-gold.png";
import violet from "@/assets/badges/crest-violet.png";
import platinum from "@/assets/badges/crest-platinum.png";
import rose from "@/assets/badges/crest-rose.png";
import bronze from "@/assets/badges/crest-bronze.png";

const ART: Record<string, string> = {
  super_admin: superAdmin,
  owner: superAdmin,
  app_owner: imperial,
  admin,
  moderator,
  welcome_manager: moderator,
  host,
  room_owner: roomOwner,
  room_operations_assistant: emerald,
  gift_1m: gold,
  gift_10m: gold,
  gift_100m: gold,
  gift_1b: imperial,
};

/** صور الأطقم حسب نمط اللون — كل شارة تأخذ تصميمها المستقل */
const STYLE_ART: Record<string, string> = {
  royal: superAdmin,
  imperial,
  crimson,
  ruby: crimson,
  flame: crimson,
  rose,
  coral: rose,
  magenta: rose,
  pink: rose,
  sapphire,
  azure: sapphire,
  sky: sapphire,
  ocean: sapphire,
  indigo: sapphire,
  steel: sapphire,
  cyan: sapphire,
  teal: emerald,
  emerald,
  jade: emerald,
  mint: emerald,
  lime: emerald,
  gold,
  amber: gold,
  honey: bronze,
  bronze,
  sunset: bronze,
  platinum,
  pearl: platinum,
  diamond: platinum,
  violet,
  obsidian: violet,
};

/** صورة الشارة الرسمية حسب المفتاح ثم حسب نمطها، أو null إذا لم توجد. */
export function badgeArt(key?: string | null, styleKey?: string | null): string | null {
  if (key && ART[key]) return ART[key];
  if (key) {
    const assistant = /^admin_assistant_(\d+)$/.exec(key);
    if (assistant) {
      const pool = [imperial, crimson, sapphire, emerald, gold, superAdmin, admin, moderator];
      return pool[(Number(assistant[1]) - 1) % pool.length] ?? imperial;
    }
  }
  if (styleKey && STYLE_ART[styleKey]) return STYLE_ART[styleKey];
  return null;
}
