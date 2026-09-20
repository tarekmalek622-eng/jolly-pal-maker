import superAdmin from "@/assets/badges/crest-super-admin.png";
import admin from "@/assets/badges/crest-admin.png";
import moderator from "@/assets/badges/crest-moderator.png";
import host from "@/assets/badges/crest-host.png";
import roomOwner from "@/assets/badges/crest-room-owner.png";

const ART: Record<string, string> = {
  super_admin: superAdmin,
  owner: superAdmin,
  admin,
  moderator,
  welcome_manager: moderator,
  host,
  room_owner: roomOwner,
};

/** صورة الشارة الرسمية حسب المفتاح، أو null إذا لم توجد. */
export function badgeArt(key?: string | null): string | null {
  if (!key) return null;
  return ART[key] ?? null;
}
