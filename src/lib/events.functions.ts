import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CupEntry } from "@/lib/cups.functions";

export type EventPrize = { id: string; rank_from: number; rank_to: number; coins: number; label: string };

export type EventCard = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  ranking_kind: string;
  starts_at: string;
  ends_at: string;
  status: string;
  rules: string | null;
  points_note: string | null;
  top_prize: number;
  prize_count: number;
};

const EVENT_COLUMNS =
  "id, title, subtitle, description, image_url, ranking_kind, starts_at, ends_at, status, rules, points_note, cup_event_prizes(id, rank_from, rank_to, coins, label)";

/** قائمة الأحداث للعرض ككروت — بدون تحميل جداول الترتيب (أسرع بكثير). */
export const listEventCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // تسلسل تلقائي: إنهاء المنتهي وبدء التالي فورًا قبل العرض
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).rpc("events_tick");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any)
      .from("cup_events")
      .select(EVENT_COLUMNS)
      .in("status", ["active", "settling", "finished"])
      .order("status", { ascending: true })
      .order("ends_at", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((event) => {
      const prizes = (event.cup_event_prizes ?? []) as EventPrize[];
      return {
        ...event,
        cup_event_prizes: undefined,
        top_prize: prizes.reduce((max, p) => Math.max(max, Number(p.coins)), 0),
        prize_count: prizes.length,
      } as EventCard;
    });
  });

/** تفاصيل حدث واحد: الجوائز، الترتيب الكامل، وموقع المستخدم الحالي. */
export const getEventDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: event, error } = await db.from("cup_events").select(EVENT_COLUMNS).eq("id", data.eventId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) throw new Error("الحدث غير موجود");

    const board = await db.rpc("cup_event_leaderboard", { _event_id: data.eventId, _limit: 50 });
    if (board.error) throw new Error(board.error.message);
    const leaderboard = (board.data ?? []) as CupEntry[];
    const myIndex = leaderboard.findIndex((row) => row.entity_id === context.userId);

    const prizes = ((event.cup_event_prizes ?? []) as EventPrize[]).sort((a, b) => a.rank_from - b.rank_from);
    const myRank = myIndex >= 0 ? myIndex + 1 : null;
    const myPrize = myRank ? prizes.find((p) => myRank >= p.rank_from && myRank <= p.rank_to) ?? null : null;

    return {
      event: { ...event, cup_event_prizes: undefined } as EventCard,
      prizes,
      leaderboard,
      me: {
        rank: myRank,
        score: myIndex >= 0 ? Number(leaderboard[myIndex]?.score ?? 0) : 0,
        prize: myPrize ? Number(myPrize.coins) : 0,
      },
    };
  });

export type BreakAppStats = {
  period: string;
  since: string;
  gifts: { total_value: number; count: number; senders: number; receivers: number; rooms: number };
  games: { bets: number; payouts: number; net: number; rounds: number; max_bet: number; max_payout: number };
  topups: { coins: number; count: number; users: number };
};

/** إحصائيات كأس التطبيق من العمليات الفعلية. */
export const getBreakAppStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ period: z.enum(["day", "week", "month"]) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabaseAdmin as any).rpc("break_app_stats", { _period: data.period });
    if (result.error) throw new Error(result.error.message);
    return result.data as BreakAppStats;
  });
