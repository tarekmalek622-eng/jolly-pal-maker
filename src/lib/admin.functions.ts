import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: {
  rpc: (fn: "is_admin", args?: Record<string, never>) => Promise<{ data: unknown; error: unknown }>;
}) {
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) throw new Error("هذه العملية للإدارة فقط");
}

async function log(actorId: string, targetId: string, action: string, oldValue: string, newValue: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    target_id: targetId,
    action,
    old_value: oldValue,
    new_value: newValue,
  });
}

export const adminAdjustCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().int().min(-10_000_000).max(10_000_000),
        reason: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from("coin_wallets")
      .select("coins")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (walletError) throw new Error(walletError.message);
    if (!wallet) throw new Error("لا توجد محفظة لهذا المستخدم");

    const before = wallet.coins;
    const after = Math.max(0, before + data.amount);

    const { error: updateError } = await supabaseAdmin
      .from("coin_wallets")
      .update({ coins: after })
      .eq("user_id", data.userId);
    if (updateError) throw new Error(updateError.message);

    await supabaseAdmin.from("coin_transactions").insert({
      user_id: data.userId,
      kind: "admin",
      amount: after - before,
      balance_before: before,
      balance_after: after,
      reference: data.reason,
    });

    await log(context.userId, data.userId, "adjust_coins", String(before), String(after));
    return { balance: after };
  });

export const adminSetSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.userId, "set_suspended", String(!data.suspended), String(data.suspended));
    return { ok: true };
  });

export const adminSetRoomDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rooms")
      .update({ is_disabled: data.disabled })
      .eq("id", data.roomId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.roomId, "set_room_disabled", String(!data.disabled), String(data.disabled));
    return { ok: true };
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reportId: z.string().uuid(), status: z.enum(["resolved", "rejected", "pending"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("reports")
      .update({ status: data.status, handled_by: context.userId })
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.reportId, "resolve_report", "pending", data.status);
    return { ok: true };
  });
