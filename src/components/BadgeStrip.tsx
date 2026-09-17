import { cn } from "@/lib/utils";
import { Award } from "lucide-react";

interface BadgeStripProps {
  count?: number;
  rank?: number | string;
  className?: string;
}

export function BadgeStrip({ count, rank, className }: BadgeStripProps) {
  if (!count && !rank) return null;
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[9px] font-bold backdrop-blur-md border border-white/10 shadow-sm transition-all",
      className
    )}>
      <Award className="h-3 w-3 text-primary" />
      {rank && <span>#{rank}</span>}
      {count !== undefined && (
        <span className="flex items-center gap-0.5">
          <span className="opacity-60">|</span>
          {count} شارة
        </span>
      )}
    </div>
  );
}
