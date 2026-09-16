import { cn } from "@/lib/utils";

/**
 * اسم المستخدم مع تلوين خاص لأصحاب VIP:
 * - VIP 4 و 5: اسم متحرك متعدد الألوان.
 * - VIP 1-3: ذهبي ثابت.
 */
export function VipName({
  name,
  vipLevel = 0,
  className,
}: {
  name: string;
  vipLevel?: number;
  className?: string;
}) {
  const flow = vipLevel >= 4;
  const gold = vipLevel >= 1 && vipLevel < 4;
  return (
    <span
      className={cn(
        "truncate font-bold",
        flow && "text-vip-flow",
        gold && "text-gradient-gold",
        className,
      )}
    >
      {name}
    </span>
  );
}

/** الآيدي بنفس تدرّج VIP. */
export function VipId({
  publicId,
  vipLevel = 0,
  className,
}: {
  publicId: string;
  vipLevel?: number;
  className?: string;
}) {
  const flow = vipLevel >= 4;
  return (
    <span className={cn("text-[11px]", flow ? "text-vip-flow font-bold" : "text-muted-foreground", className)}>
      ID: {publicId}
    </span>
  );
}
