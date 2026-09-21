import { cn } from "@/lib/utils";
import { getVipVisual } from "@/lib/vip-frames";

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
  const visual = getVipVisual(vipLevel);
  return (
    <span
      className={cn(
        "truncate font-bold",
        visual?.nameClass,
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
  const visual = getVipVisual(vipLevel);
  return (
    <span className={cn("text-[11px]", visual ? `${visual.nameClass} font-bold` : "text-muted-foreground", className)}>
      ID: {publicId}
    </span>
  );
}
