/** تصنيفات مركز الإشعارات — تجمع أنواع الإشعارات الحقيقية في الفئات المعروضة للمستخدم. */
export type NotificationGroup = {
  key: string;
  label: string;
  emoji: string;
  kinds: string[];
};

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  { key: "all", label: "الكل", emoji: "👑", kinds: [] },
  { key: "gift", label: "الهدايا", emoji: "🎁", kinds: ["gift", "treasure"] },
  { key: "friend", label: "الأصدقاء", emoji: "🤝", kinds: ["friend_request", "friend_accepted"] },
  { key: "relationship", label: "العلاقات", emoji: "💞", kinds: ["relationship"] },
  {
    key: "family",
    label: "العائلات",
    emoji: "🏰",
    kinds: ["family", "family_request", "family_member"],
  },
  {
    key: "event",
    label: "الأحداث",
    emoji: "🎉",
    kinds: ["event_prize", "event_start", "event_winners"],
  },
  {
    key: "reward",
    label: "الجوائز",
    emoji: "🏆",
    kinds: ["reward", "badge_unlocked", "admin_badge", "wallet"],
  },
  { key: "vip", label: "VIP / CVIP", emoji: "💎", kinds: ["vip", "cvip"] },
  {
    key: "system",
    label: "النظام",
    emoji: "⚙️",
    kinds: ["system", "welcome", "role_change", "administrative"],
  },
];

export function groupKinds(key: string): string[] {
  return NOTIFICATION_GROUPS.find((g) => g.key === key)?.kinds ?? [];
}

const KIND_META: Record<string, { emoji: string; label: string }> = {
  gift: { emoji: "🎁", label: "هدية" },
  treasure: { emoji: "🧰", label: "صندوق" },
  friend_request: { emoji: "🤝", label: "طلب صداقة" },
  friend_accepted: { emoji: "✅", label: "صداقة" },
  relationship: { emoji: "💞", label: "علاقة" },
  family: { emoji: "🏰", label: "عائلة" },
  family_request: { emoji: "📨", label: "طلب عائلة" },
  family_member: { emoji: "👥", label: "عضوية" },
  event_prize: { emoji: "🏅", label: "جائزة حدث" },
  event_start: { emoji: "🚀", label: "بداية حدث" },
  event_winners: { emoji: "🥇", label: "فائزون" },
  reward: { emoji: "🏆", label: "مكافأة" },
  badge_unlocked: { emoji: "🎖️", label: "شارة" },
  admin_badge: { emoji: "🎖️", label: "شارة إدارية" },
  wallet: { emoji: "👛", label: "المحفظة" },
  vip: { emoji: "💎", label: "VIP" },
  cvip: { emoji: "💠", label: "CVIP" },
  system: { emoji: "⚙️", label: "النظام" },
  welcome: { emoji: "👋", label: "ترحيب" },
  role_change: { emoji: "🛡️", label: "صلاحية" },
  administrative: { emoji: "🛡️", label: "إدارة" },
};

export function kindMeta(kind: string): { emoji: string; label: string } {
  return KIND_META[kind] ?? { emoji: "👑", label: "إشعار" };
}
