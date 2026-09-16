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

export const COINS_RATE_NOTE = "عملة افتراضية داخل التطبيق — 80,000,000 عملة = 1$ ولا تُصرف نقدًا.";
