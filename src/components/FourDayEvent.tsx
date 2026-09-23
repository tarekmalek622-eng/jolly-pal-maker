import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Gift, Loader2, Trophy } from "lucide-react";
import throneArt from "@/assets/sawtak-throne-event.jpg";
import { UserAvatar } from "@/components/UserAvatar";
import { getActiveCupEvents } from "@/lib/cups.functions";

const DAYS = ["انطلاقة الدعم", "مضاعفة الحماس", "سباق المراكز", "الحسم والتتويج"];

export function FourDayEvent() {
  const query = useQuery({
    queryKey: ["active-cup-events"],
    queryFn: () => getActiveCupEvents(),
    staleTime: 60_000,
  });
  if (query.isLoading) return <div className="h-52 animate-pulse rounded-3xl bg-surface-2" />;
  const event = query.data?.[0];
  if (!event) return null;
  const board = event.leaderboard ?? [];
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  const now = Date.now();
  const day = Math.min(4, Math.max(1, Math.floor((now - start) / 86_400_000) + 1));
  const left = Math.max(0, end - now);
  const leftText = left === 0 ? "انتهى الحدث" : `${Math.ceil(left / 86_400_000)} يوم متبقٍ`;

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-400/40 bg-[#120b24] shadow-xl">
      <div className="relative h-44">
        <img
          src={throneArt}
          alt={event.title}
          width={1536}
          height={1024}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#120b24] via-transparent to-black/10" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <span className="rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-amber-300">
            <CalendarDays className="me-1 inline h-3 w-3" />
            {leftText}
          </span>
          <h2 className="mt-2 text-xl font-black text-white">{event.title}</h2>
          <p className="text-xs text-white/70">{event.subtitle}</p>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-4 gap-1">
          {DAYS.map((label, i) => (
            <div
              key={label}
              className={`rounded-xl p-2 text-center ${i + 1 === day ? "bg-amber-400 text-black" : i + 1 < day ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-white/45"}`}
            >
              <b className="block text-[10px]">اليوم {i + 1}</b>
              <span className="text-[8px]">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {event.prizes
            .sort((a, b) => a.rank_from - b.rank_from)
            .map((p) => (
              <div
                key={p.id}
                className="min-w-28 rounded-xl border border-amber-400/20 bg-amber-400/5 p-2"
              >
                <Gift className="mb-1 h-3.5 w-3.5 text-amber-400" />
                <p className="text-[9px] text-white/60">
                  {p.rank_from === p.rank_to
                    ? `المركز ${p.rank_from}`
                    : `${p.rank_from} - ${p.rank_to}`}
                </p>
                <b className="text-[11px] text-amber-300">{p.coins.toLocaleString("en-US")} كوين</b>
              </div>
            ))}
        </div>
        {board.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-black text-white">
              <Trophy className="h-4 w-4 text-amber-400" /> الترتيب المباشر
            </p>
            <div className="space-y-1.5">
              {board.slice(0, 3).map((e, i) => (
                <div
                  key={e.entity_id}
                  className="flex items-center gap-2 rounded-xl bg-white/5 p-2"
                >
                  <b className="w-5 text-center text-amber-300">{i + 1}</b>
                  <UserAvatar src={e.avatar_url ?? e.image_url} name={e.display_name} size={32} />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">
                    {e.display_name}
                  </span>
                  <span className="text-[10px] text-amber-300">
                    {Number(e.score).toLocaleString("en-US")} ⭐
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {query.isFetching && <Loader2 className="mx-auto h-4 w-4 animate-spin text-amber-400" />}
      </div>
    </section>
  );
}
