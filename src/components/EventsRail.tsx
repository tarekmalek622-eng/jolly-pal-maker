import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Gift, Loader2 } from "lucide-react";
import { listEventCards, type EventCard } from "@/lib/events.functions";
import { eventArt } from "@/lib/event-art";
import { formatCompact } from "@/lib/format";

const KIND_LABEL: Record<string, string> = {
  supporters: "ترتيب الداعمين",
  receivers: "ترتيب المستلمين",
  rooms: "ترتيب الغرف",
  topups: "ترتيب الشاحنين",
  game_wins: "مكاسب الألعاب",
};

function remaining(endsAt: string): string {
  const left = new Date(endsAt).getTime() - Date.now();
  if (left <= 0) return "انتهى";
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return `${days} يوم متبقٍ`;
  const hours = Math.floor(left / 3_600_000);
  return hours >= 1 ? `${hours} ساعة متبقية` : "أقل من ساعة";
}

/** كروت الأحداث بصورة كبيرة — التفاصيل الكاملة داخل صفحة الحدث. */
export function EventsRail() {
  const events = useQuery({
    queryKey: ["event-cards"],
    queryFn: () => listEventCards(),
    staleTime: 120_000,
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
      <p className="text-sm font-black">الأحداث</p>
      {list.map((event) => (
        <Link
          key={event.id}
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="block overflow-hidden rounded-3xl border border-amber-400/30 bg-[#120b24] shadow-lg active:scale-[0.99]"
        >
          <div className="relative h-40">
            <img
              src={eventArt(event.image_url)}
              alt={event.title}
              loading="lazy"
              width={1024}
              height={640}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#120b24] via-[#120b24]/25 to-transparent" />
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-amber-300">
              <CalendarDays className="me-1 inline h-3 w-3" />
              {remaining(event.ends_at)}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="text-base font-black text-white">{event.title}</h3>
              <p className="truncate text-[11px] text-white/70">{event.subtitle ?? KIND_LABEL[event.ranking_kind]}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/70">
              {KIND_LABEL[event.ranking_kind] ?? event.ranking_kind}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-black text-amber-300">
              <Gift className="h-3.5 w-3.5" /> حتى {formatCompact(event.top_prize)} كوينز
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
