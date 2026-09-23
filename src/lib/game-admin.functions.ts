import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function assertAdmin(supabase: Rpc, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error || data !== true) throw new Error("هذه العملية للإدارة فقط");
}

export interface GameRoundRow {
  id: string;
  round_no: number;
  session_round_no: number | null;
  status: string;
  winning_key: string | null;
  total_bets: number | null;
  total_amount: number | null;
  total_payout: number | null;
  attempts: number | null;
  last_error: string | null;
  started_at: string | null;
  ends_at: string | null;
  settled_at: string | null;
  processing_started_at: string | null;
}

export interface GameTopRow {
  user_id: string;
  display_name: string | null;
  public_id: string | null;
  avatar_url: string | null;
  gross_win: number;
  total_bet: number;
  net_result: number;
  rank: number;
}

export interface GameMonitorData {
  session: {
    id: string;
    session_date: string;
    status: string;
    total_rounds: number;
    max_rounds: number;
    settled_at: string | null;
  } | null;
  current: GameRoundRow | null;
  recent: GameRoundRow[];
  failed: GameRoundRow[];
  stats: {
    rounds: number;
    bets: number;
    amount: number;
    payout: number;
    net: number;
    winners: number;
    losers: number;
    avg_settle_ms: number;
  };
  top: GameTopRow[];
  recovery: { id: string; action: string; created_at: string; new_value: string | null }[];
  slots: { key: string; label: string; multiplier: number }[];
  forced_key: string | null;
}

const ROUND_COLS =
  "id, round_no, session_round_no, status, winning_key, total_bets, total_amount, total_payout, attempts, last_error, started_at, ends_at, settled_at, processing_started_at";

export const getGameMonitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GameMonitorData> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sessionRes = await supabaseAdmin
      .from("wheel_sessions")
      .select("id, session_date, status, total_rounds, max_rounds, settled_at")
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const session = sessionRes.data ?? null;

    const currentRes = await supabaseAdmin
      .from("wheel_rounds")
      .select(ROUND_COLS)
      .in("status", ["betting", "processing", "result_ready", "waiting"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const recentRes = await supabaseAdmin
      .from("wheel_rounds")
      .select(ROUND_COLS)
      .order("created_at", { ascending: false })
      .limit(25);

    const failedRes = await supabaseAdmin
      .from("wheel_rounds")
      .select(ROUND_COLS)
      .or("status.eq.failed,last_error.not.is.null")
      .order("created_at", { ascending: false })
      .limit(20);

    const rounds = (recentRes.data ?? []) as GameRoundRow[];
    const settledRounds = rounds.filter((r) => r.settled_at && r.started_at);
    const avg =
      settledRounds.length === 0
        ? 0
        : Math.round(
            settledRounds.reduce(
              (sum, r) =>
                sum +
                (new Date(r.settled_at!).getTime() -
                  new Date(r.processing_started_at ?? r.started_at!).getTime()),
              0,
            ) / settledRounds.length,
          );

    let winners = 0;
    let losers = 0;
    if (session) {
      const roundIds = rounds.map((r) => r.id);
      if (roundIds.length > 0) {
        const bets = await supabaseAdmin
          .from("wheel_bets")
          .select("payout")
          .in("round_id", roundIds)
          .limit(5000);
        for (const b of bets.data ?? []) {
          if ((b.payout ?? 0) > 0) winners += 1;
          else losers += 1;
        }
      }
    }

    const topRes = await supabaseAdmin.rpc("wheel_daily_top", { _limit: 10 });
    const recoveryRes = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, created_at, new_value")
      .in("action", [
        "admin_wheel_close",
        "wheel_recover",
        "wheel_settle_day",
        "admin_wheel_settle_day",
        "admin_wheel_force_result",
      ])
      .order("created_at", { ascending: false })
      .limit(20);

    const current = (currentRes.data ?? null) as GameRoundRow | null;
    let slots: GameMonitorData["slots"] = [];
    if (current) {
      const slotsRes = await supabaseAdmin
        .from("wheel_rounds")
        .select("slots")
        .eq("id", current.id)
        .maybeSingle();
      const raw = (slotsRes.data?.slots ?? []) as {
        key?: string;
        label?: string;
        multiplier?: number;
      }[];
      slots = (Array.isArray(raw) ? raw : []).map((s) => ({
        key: String(s.key ?? ""),
        label: String(s.label ?? s.key ?? ""),
        multiplier: Number(s.multiplier ?? 0),
      }));
    }

    return {
      session,
      current,
      slots,
      forced_key: current?.winning_key ?? null,
      recent: rounds,
      failed: (failedRes.data ?? []) as GameRoundRow[],
      stats: {
        rounds: rounds.length,
        bets: rounds.reduce((s, r) => s + (r.total_bets ?? 0), 0),
        amount: rounds.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
        payout: rounds.reduce((s, r) => s + Number(r.total_payout ?? 0), 0),
        net:
          rounds.reduce((s, r) => s + Number(r.total_amount ?? 0), 0) -
          rounds.reduce((s, r) => s + Number(r.total_payout ?? 0), 0),
        winners,
        losers,
        avg_settle_ms: avg,
      },
      top: (topRes.data ?? []) as GameTopRow[],
      recovery: (recoveryRes.data ?? []) as GameMonitorData["recovery"],
    };
  });

export const adminRecoverRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roundId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settled = await supabaseAdmin.rpc("wheel_settle", { _round_id: data.roundId });
    if (settled.error) throw new Error(settled.error.message);
    const after = await supabaseAdmin
      .from("wheel_rounds")
      .select(ROUND_COLS)
      .eq("id", data.roundId)
      .single();
    if (after.error) throw new Error(after.error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.roundId,
      action: "wheel_recover",
      old_value: "",
      new_value: JSON.stringify({ status: after.data.status, winning_key: after.data.winning_key }),
    });
    return after.data as GameRoundRow;
  });

export const adminSettleGameDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.rpc("wheel_settle_day", { _session_id: data.sessionId });
    if (res.error) throw new Error(res.error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.sessionId,
      action: "admin_wheel_settle_day",
      old_value: "",
      new_value: JSON.stringify(res.data ?? {}),
    });
    return { rewarded: Number(res.data ?? 0) };
  });

export const adminSetWheelWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ roundId: z.string().uuid(), slotKey: z.string().trim().min(1).max(40).nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const round = await supabaseAdmin
      .from("wheel_rounds")
      .select("id, status, slots, winning_key")
      .eq("id", data.roundId)
      .maybeSingle();
    if (round.error || !round.data) throw new Error("الجولة غير موجودة");
    if (!["betting", "waiting"].includes(round.data.status)) {
      throw new Error("لا يمكن تحديد النتيجة بعد إغلاق الرهان");
    }
    if (data.slotKey) {
      const keys = ((round.data.slots ?? []) as { key?: string }[]).map((s) => String(s.key ?? ""));
      if (!keys.includes(data.slotKey)) throw new Error("هذا العنصر غير موجود في الجولة");
    }

    const updated = await supabaseAdmin
      .from("wheel_rounds")
      .update({ winning_key: data.slotKey })
      .eq("id", data.roundId)
      .select("id, winning_key")
      .maybeSingle();
    if (updated.error || !updated.data) throw new Error(updated.error?.message ?? "تعذر التحديد");

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.roundId,
      action: "admin_wheel_force_result",
      old_value: JSON.stringify({ winning_key: round.data.winning_key }),
      new_value: JSON.stringify({ winning_key: updated.data.winning_key }),
    });
    return { winning_key: updated.data.winning_key as string | null };
  });
