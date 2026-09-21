import tajMark from "@/assets/al-taj-mark.png";
import { cn } from "@/lib/utils";

export function BrandMark({
  size = 48,
  showName = false,
  className,
}: {
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={tajMark}
        alt="شعار التاج"
        width={1024}
        height={1024}
        className="shrink-0 object-contain drop-shadow-[0_6px_14px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
        style={{ width: size, height: size }}
      />
      {showName ? <span className="font-display font-black text-gradient-gold">التاج</span> : null}
    </span>
  );
}