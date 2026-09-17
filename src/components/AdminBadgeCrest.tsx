import { Crown, Shield, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = [
  "from-primary/35 via-warning/20 to-destructive/25 border-primary/50 text-primary",
  "from-destructive/30 via-primary/15 to-warning/25 border-destructive/45 text-destructive",
  "from-accent/30 via-primary/15 to-success/25 border-accent/45 text-accent",
  "from-success/30 via-warning/15 to-primary/25 border-success/45 text-success",
] as const;

function styleIndex(styleKey: string) {
  return Array.from(styleKey).reduce((sum, char) => sum + char.charCodeAt(0), 0) % STYLES.length;
}

export function AdminBadgeCrest({
  name,
  styleKey = "royal",
  compact = false,
}: {
  name: string;
  styleKey?: string;
  compact?: boolean;
}) {
  const palette = STYLES[styleIndex(styleKey)];
  return (
    <div className={cn("relative flex flex-col items-center text-center", compact ? "w-24" : "w-full")}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-[1.4rem] border-2 bg-gradient-to-br shadow-glow",
          palette,
          compact ? "h-16 w-16" : "h-20 w-20",
        )}
      >
        <span className="absolute -top-3 rounded-full border border-current bg-background p-1 shadow-lg">
          <Crown className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <span className="absolute -start-2 top-4 h-8 w-4 -rotate-12 rounded-full border border-current bg-current/15" />
        <span className="absolute -end-2 top-4 h-8 w-4 rotate-12 rounded-full border border-current bg-current/15" />
        <Shield className={compact ? "h-8 w-8" : "h-10 w-10"} fill="currentColor" fillOpacity={0.16} />
        <Sparkles className="absolute end-1 top-1 h-3 w-3" />
        <span className="absolute -bottom-2 rounded-full border border-current bg-background px-2 py-0.5 text-[8px] font-black">
          مساعد
        </span>
      </div>
      <span className={cn("mt-3 line-clamp-2 font-black leading-tight", compact ? "text-[9px]" : "text-[11px]")}>{name}</span>
    </div>
  );
}