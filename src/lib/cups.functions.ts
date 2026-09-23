import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const periodSchema = z.enum(["day", "week", "month"]);
const categorySchema = z.enum(["supporters", "rooms", "receivers", "topups", "game_wins"]);

export type CupEntry = {
  entity_id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  image_url: string | null;
  score: number;
};

export type CupEvent = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  ranking_kind: string;
  starts_at: string;
  ends_at: string;
  status: string;
  prizes: { id: string; rank_from: number; rank_to: number; coins: number; label: string }[];
};

export const getAppCupLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ category: categorySchema, period: periodSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("app_cup_leaderboard", {
      _category: data.category,
      _period: data.period,
      _limit: 10,
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as CupEntry[];
  });

export const getRoomCupLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), period: periodSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("room_cup_leaderboard", {
      _room_id: data.roomId,
      _period: data.period,
      _limit: 10,
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []).map((row) => ({
      id: row.user_id,
      public_id: row.public_id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      vip_level: row.vip_level,
      coins: Number(row.score),
    }));
  });

export const getActiveCupEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: events, error } = await supabaseAdmin
      .from("cup_events")
      .select(
        "id, title, subtitle, description, image_url, ranking_kind, starts_at, ends_at, status, cup_event_prizes(id, rank_from, rank_to, coins, label)",
      )
      .in("status", ["active", "finished"])
      .order("starts_at", { ascending: false })
      .limit(4);
    if (error) throw new Error(error.message);
    const result: CupEvent[] = [];
    for (const event of events ?? []) {
      const board = await supabaseAdmin.rpc("cup_event_leaderboard", {
        _event_id: event.id,
        _limit: 10,
      });
      if (board.error) throw new Error(board.error.message);
      result.push({
        ...event,
        prizes: event.cup_event_prizes ?? [],
        leaderboard: board.data ?? [],
      } as CupEvent & { leaderboard: CupEntry[] });
    }
    return result as (CupEvent & { leaderboard: CupEntry[] })[];
  });
