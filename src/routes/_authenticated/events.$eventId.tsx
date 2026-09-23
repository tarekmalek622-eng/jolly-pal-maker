import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Gift, Loader2, ScrollText, Target, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { getEventDetails } from "@/lib/events.functions";
import { eventArt, eventStyle } from "@/lib/event-art";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events/$eventId")({
  head: () => ({
    meta: [
      { title: "تفاصيل الحدث — التاج" },
      { name: "description", content: "المراكز والمكافآت والسياسات وتقدمك داخل أحداث التاج." },
      { property: "og:title", content: "تفاصيل الحدث — التاج" },
      { property: "og:description", content: "ترتيب مباشر ومكافآت حقيقية داخل أحداث التاج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventDetailsPage,
});

const TABS = [
  ["board", "المراكز", Trophy],
  ["rewards", "المكافآت", Gift],
  ["rules", "السياسات", ScrollText],
  ["me", "تقدمي", Target],
] as const;

const MEDALS = ["🥇", "🥈", "🥉"];

function EventDetailsPage() {
  const { eventId } = Route.useParams();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("board");
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery({
    queryKey: ["event-details", eventId],
    queryFn: () => getEventDetails({ data: { eventId } }),
    staleTime: 30_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = useMemo(() => {
    const ends = query.data ? new Date(query.data.event.ends_at).getTime() : 0;
    const left = ends - now;
    if (!ends) return "";
    if (left <= 0) return "انتهى الحدث";
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    const minutes = Math.floor((left % 3_600_000) / 60_000);
    return days > 0 ? `${days} يوم و ${hours} ساعة` : `${hours} ساعة و ${minutes} دقيقة`;
  }, [query.data, now]);

  if (query.isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }
  if (query.isError || !query.data) {
    return (
      <AppShell>
        <div className="space-y-3 py-10 text-center">
          <p className="text-sm font-bold">تعذر تحميل الحدث</p>
          <Link to="/games" className="text-xs text-primary">
            العودة للاستكشاف
          </Link>
        </div>
      </AppShell>
    );
  }

  const { event, prizes, leaderboard, me } = query.data;
  const style = eventStyle(event.style);
  const statusLabel =
    event.status === "active"
      ? "جارٍ الآن"
      : event.status === "finished"
        ? "منتهٍ"
        : event.status === "settling"
          ? "جارٍ التوزيع"
          : event.status;

  return (
    <AppShell>
      <div className="-mx-4 -mt-4 mb-4">
        <div className={`relative h-56 bg-gradient-to-br ${style.card}`}>
          <img
            src={eventArt(event.image_url)}
            alt={event.title}
            width={1024}
            height={640}
            className="h-full w-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
          <Link
            to="/games"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"
            aria-label="رجوع"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="absolute inset-x-0 bottom-0 space-y-1 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black backdrop-blur ${style.chip}`}
              >
                {statusLabel}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur ${style.chip}`}
              >
                <CalendarDays className="me-1 inline h-3 w-3" />
                {countdown}
              </span>
            </div>
            <h1 className="text-xl font-black">{event.title}</h1>
            <p className="text-[11px] text-muted-foreground">{event.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-[11px] font-bold",
              tab === key
                ? "border-primary/60 gradient-gold text-primary-foreground"
                : "border-border bg-surface text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "board" &&
        (leaderboard.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            تبدأ المراكز مع أول عملية مؤكدة داخل الحدث.
          </p>
        ) : (
          <ol className="space-y-2">
            {leaderboard.map((entry, i) => (
              <li
                key={entry.entity_id}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border p-2.5",
                  i < 3 ? "border-amber-400/40 bg-amber-400/5" : "border-border bg-surface",
                )}
              >
                <span className="w-7 text-center text-sm font-black">{MEDALS[i] ?? i + 1}</span>
                <UserAvatar
                  src={entry.avatar_url ?? entry.image_url}
                  name={entry.display_name}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{entry.display_name}</p>
                  <p className="text-[9px] text-muted-foreground">ID: {entry.public_id}</p>
                </div>
                <b className="text-[11px] text-amber-400" title={formatFull(entry.score)}>
                  {formatCompact(entry.score)}
                </b>
              </li>
            ))}
          </ol>
        ))}

      {tab === "rewards" && (
        <div className="space-y-2">
          {prizes.map((prize) => (
            <div
              key={prize.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3"
            >
              <div>
                <p className="text-xs font-black">{prize.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {prize.rank_from === prize.rank_to
                    ? `المركز ${prize.rank_from}`
                    : `المراكز ${prize.rank_from} - ${prize.rank_to}`}
                </p>
              </div>
              <b className="text-sm text-amber-400" title={`${formatFull(prize.coins)} كوينز`}>
                {formatCompact(prize.coins)}
              </b>
            </div>
          ))}
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-3">
          <section className="rounded-2xl border border-border bg-surface p-3">
            <p className="mb-1 text-xs font-black">السياسات</p>
            <p className="text-[11px] leading-6 text-muted-foreground">
              {event.rules ?? "لا توجد سياسات مضافة."}
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-surface p-3">
            <p className="mb-1 text-xs font-black">تفاصيل الحدث</p>
            <p className="text-[11px] leading-6 text-muted-foreground">{event.description}</p>
            <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
              <span>البداية: {new Date(event.starts_at).toLocaleString("ar-EG")}</span>
              <span>النهاية: {new Date(event.ends_at).toLocaleString("ar-EG")}</span>
              <span>حساب النقاط: {event.points_note}</span>
            </div>
          </section>
        </div>
      )}

      {tab === "me" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="مركزك" value={me.rank ? `#${me.rank}` : "—"} />
            <Stat label="نقاطك" value={formatCompact(me.score)} full={formatFull(me.score)} />
            <Stat
              label="جائزتك الحالية"
              value={formatCompact(me.prize)}
              full={formatFull(me.prize)}
            />
          </div>
          <p className="rounded-2xl border border-border bg-surface p-3 text-[11px] leading-6 text-muted-foreground">
            {event.points_note}
          </p>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value, full }: { label: string; value: string; full?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 text-center" title={full}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black text-primary">{value}</p>
    </div>
  );
}
