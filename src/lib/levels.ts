/**
 * نظام مستويات بلا حدود — نفس منحنى دالة قاعدة البيانات public.level_for_xp
 * كل مستوى يحتاج خبرة أكثر بنسبة 18% من المستوى السابق (البداية 500 نقطة).
 */
const BASE = 500;
const GROWTH = 1.18;

export function xpTotalForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0;
  let need = BASE;
  let total = 0;
  for (let i = 1; i < Math.min(level, 100000); i += 1) {
    total += need;
    need *= GROWTH;
  }
  return Math.floor(total);
}

export function levelForXp(xp: number): number {
  const value = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  let need = BASE;
  let total = 0;
  while (level < 100000) {
    total += need;
    if (total > value) break;
    level += 1;
    need *= GROWTH;
  }
  return level;
}

export function levelProgress(xp: number) {
  const value = Math.max(0, Math.floor(xp || 0));
  const level = levelForXp(value);
  const start = xpTotalForLevel(level);
  const next = xpTotalForLevel(level + 1);
  const span = Math.max(1, next - start);
  return {
    level,
    xp: value,
    intoLevel: Math.max(0, value - start),
    needed: span,
    nextAt: next,
    percent: Math.min(100, Math.max(0, ((value - start) / span) * 100)),
  };
}
