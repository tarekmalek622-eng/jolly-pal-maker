import { Crown, Shield, Sparkles, Star } from "lucide-react";
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
  imageUrl,
  variant = "crest",
}: {
  name: string;
  styleKey?: string;
  compact?: boolean;
  imageUrl?: string | null;
  variant?: string;
}) {
  const palette = STYLES[styleIndex(styleKey)];
  return (
    <div className={cn("relative flex flex-col items-center text-center", compact ? "w-24" : "w-full")}>
      <div
        className={cn(
          "admin-crest relative flex items-center justify-center border-2 bg-gradient-to-br shadow-glow",
          palette,
          compact ? "h-16 w-[4.5rem]" : "h-24 w-28",
        )}
      >
        <span className="absolute -top-4 z-20 rounded-full border border-current bg-background p-1 shadow-lg">
          <Crown className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <span className="admin-crest-wing absolute -start-4 top-3 h-10 w-6 -rotate-12 border border-current bg-current/15" />
        <span className="admin-crest-wing absolute -end-4 top-3 h-10 w-6 rotate-12 border border-current bg-current/15" />
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-[72%] w-[72%] object-contain" loading="lazy" />
        ) : (
          <Shield className={compact ? "h-9 w-9" : "h-14 w-14"} fill="currentColor" fillOpacity={0.2} />
        )}
        <Sparkles className="absolute end-1 top-1 h-3 w-3" />
        <span className="absolute -bottom-2 flex gap-0.5 rounded-full border border-current bg-background px-2 py-0.5">
          {[0, 1, 2].map((star) => <Star key={star} className="h-2.5 w-2.5 fill-current" />)}
        </span>
      </div>
      <span className={cn("relative z-20 mt-2 line-clamp-2 min-w-full rounded-full border border-primary/45 bg-background px-2 py-1 font-black leading-tight text-primary shadow-glow", compact ? "text-[9px]" : "text-[11px]")}>{name}</span>
    </div>
  );
}