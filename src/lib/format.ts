/** تنسيق موحّد للأرقام الكبيرة: K / M / B / T بدون رموز غريبة. */
export function formatCompact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const unit = (v: number, suffix: string) => {
    const rounded = Math.round(v * 10) / 10;
    const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
    return `${sign}${text}${suffix}`;
  };
  if (abs >= 1_000_000_000_000) return unit(abs / 1_000_000_000_000, "T");
  if (abs >= 1_000_000_000) return unit(abs / 1_000_000_000, "B");
  if (abs >= 1_000_000) return unit(abs / 1_000_000, "M");
  if (abs >= 1_000) return unit(abs / 1_000, "K");
  return `${sign}${abs.toLocaleString("en-US")}`;
}

/** الرقم الكامل بالفواصل، يُستخدم في Tooltip أو عند الضغط على الرقم. */
export function formatFull(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US");
}

/** نص كوينز مختصر، مثل «10B كوينز». */
export function formatCoins(value: number | string | null | undefined): string {
  return `${formatCompact(value)} كوينز`;
}
