/** أسماء أقسام الإدارة بالعربية — تُستخدم في لوحة الإدارة وفي صفحة حسابي. */
export const ADMIN_SECTION_LABELS: Record<string, string> = {
  users: "المستخدمون",
  rooms: "الغرف",
  roomMessages: "رسائل الغرف",
  banners: "البنرات",
  badges: "الشارات",
  gifts: "الهدايا",
  store: "المتجر",
  vip: "VIP",
  cvip: "SVIP",
  coins: "الكوينز",
  topups: "طلبات الشحن",
  games: "الألعاب",
  gameEngine: "لوحة اللعبة",
  quiz: "الأسئلة",
  reports: "الإبلاغات",
  welcome: "الترحيبية",
  roomSystems: "أنظمة الغرفة",
  families: "العائلات",
  logs: "السجل",
  tasks: "المهام",
  support: "الدعم",
  stats: "الإحصائيات",
  registration: "بيانات التسجيل",
};

export function adminSectionLabel(key: string) {
  return ADMIN_SECTION_LABELS[key] ?? key;
}
