/** سعر التحويل الموحّد للعملات الافتراضية داخل التطبيق: 80,000,000 عملة = 1 دولار. */
export const COINS_PER_USD = 80_000_000;

/** القيمة التقديرية بالدولار لعدد معيّن من العملات الافتراضية. */
export function coinsToUsd(coins: number): number {
  return coins / COINS_PER_USD;
}

/** نص مختصر للقيمة التقديرية بالدولار، مثل «≈ 1.25$». */
export function coinsUsdLabel(coins: number): string {
  const usd = coinsToUsd(coins);
  if (usd === 0) return "≈ 0$";
  if (usd < 0.01) return "< 0.01$";
  return `≈ ${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}$`;
}

/** عدد العملات المقابل لمبلغ بالدولار (يُستخدم في تسعير الحزم). */
export function usdToCoins(usd: number): number {
  return Math.round(usd * COINS_PER_USD);
}

/** سعر الشحن بالجنيه المصري: 50 جنيه = 100,000,000 عملة (2,000,000 عملة للجنيه). */
export const COINS_PER_EGP = 2_000_000;

/** القيمة التقديرية بالجنيه المصري لعدد معيّن من العملات. */
export function coinsEgpLabel(coins: number): string {
  const egp = coins / COINS_PER_EGP;
  if (egp === 0) return "≈ 0 ج.م";
  if (egp < 0.5) return "< 0.5 ج.م";
  return `≈ ${egp.toLocaleString("en-US", { maximumFractionDigits: 0 })} ج.م`;
}

/** عدد العملات المقابل لمبلغ بالجنيه المصري. */
export function egpToCoins(egp: number): number {
  return Math.round(egp * COINS_PER_EGP);
}

export const COINS_RATE_NOTE =
  "عملة افتراضية داخل التطبيق — 50 ج.م = 100,000,000 عملة (80,000,000 عملة ≈ 1$) ولا تُصرف نقدًا.";
