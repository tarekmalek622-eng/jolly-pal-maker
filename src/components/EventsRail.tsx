import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Crown, Flame, Gift, Loader2, Timer, Trophy } from "lucide-react";
import { listEventCards, type EventCard } from "@/lib/events.functions";
import { eventArt, eventStyle } from "@/lib/event-art";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  supporters: "ترتيب الداعمين",
  receivers: "ترتيب المستلمين",
  rooms: "ترتيب الغرف",
  topups: "ترتيب الشاحنين",
  game_wins: "مكاسب الألعاب",
};

function remaining(endsAt: string): string {
  const left = new Date(endsAt).getTime() - Date.now();
  if (left <= 0) return "ينتهي الآن";
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return `${days} يوم متبقٍ`;
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 1) return `${hours} ساعة متبقية`;
  const mins = Math.max(1, Math.floor(left / 60_000));
  return `${mins} دقيقة متبقية`;
}

function progress(startsAt: string, endsAt: string): number {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (e <= s) return 100;
  return Math.min(100, Math.max(2, Math.round(((Date.now() - s) / (e - s)) * 100)));
}

/** كروت الأحداث — تصميم مستقل لكل حدث حسب نمطه المخزَّن في قاعدة البيانات. */
export function EventsRail() {
  const events = useQuery({
    queryKey: ["event-cards"],
    queryFn: () => listEventCards(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (events.isLoading) {
    return (
      <div className="grid h-40 place-items-center rounded-3xl bg-surface-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  const list = (events.data ?? []) as EventCard[];
  if (list.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-black">
          <Flame className="h-4 w-4 text-primary" /> الأحداث الجارية
        </p>
        <span className="text-[10px] text-muted-foreground">{list.length} حدث نشط</span>
      </div>

      {list.map((event) => {
        const style = eventStyle(event.style);
        const pct = progress(event.starts_at, event.ends_at);
        return (
          <Link
            key={event.id}
            to="/events/$eventId"
            params={{ eventId: event.id }}
            className={cn(
              "block overflow-hidden rounded-3xl border bg-gradient-to-br transition active:scale-[0.99]",
              style.card,
              style.glow,
            )}
          >
            <div className="relative h-36">
              <img
                src={eventArt(event.image_url) || style.fallback}
                alt={event.title}
                loading="lazy"
                width={1024}
                height={640}
                className="h-full w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <span
                className={cn(
                  "absolute right-3 top-3 flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold backdrop-blur",
                  style.chip,
                )}
              >
                <Timer className="h-3 w-3" />
                {remaining(event.ends_at)}
              </span>
              <span
                className={cn(
                  "absolute left-3 top-3 flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold backdrop-blur",
                  style.chip,
                )}
              >
                <Crown className="h-3 w-3" />
                {style.label}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="text-base font-black text-white drop-shadow">{event.title}</h3>
                <p className="truncate text-[11px] text-white/75">
                  {event.subtitle ?? KIND_LABEL[event.ranking_kind] ?? event.ranking_kind}
                </p>
              </div>
            </div>

            <div className="space-y-2 p-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold", style.chip)}>
                  {KIND_LABEL[event.ranking_kind] ?? event.ranking_kind}
                </span>
                <span className="flex items-center gap-2 text-[11px] font-black text-white">
                  <span className="flex items-center gap-1 text-white/70">
                    <Trophy className="h-3.5 w-3.5" /> {event.prize_count} جائزة
                  </span>
                  <span className="flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5" /> حتى {formatCompact(event.top_prize)}
                  </span>
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
