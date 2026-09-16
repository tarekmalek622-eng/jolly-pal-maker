import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function assertAdmin(supabase: Rpc, userId?: string) {
  const { data, error } = await supabase.rpc("is_admin", userId ? { _user_id: userId } : undefined);
  if (error || data !== true) throw new Error("هذه العملية للإدارة فقط");
}

async function assertSuperAdmin(supabase: Rpc, userId: string) {
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error || data !== true) throw new Error("هذه العملية للمدير العام فقط");
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
      .update({ status: data.status })
      .eq("id", data.reportId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.reportId, "resolve_report", "pending", data.status);
    return { ok: true };
  });

function clean<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as never;
}

/* ---------------- المتجر والهدايا و VIP والكوينز ---------------- */

const giftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  image_url: z.string().max(500).nullable().optional(),
  animation_url: z.string().max(500).nullable().optional(),
  price: z.number().int().min(1).max(10_000_000),
  rarity: z.enum(["common", "rare", "epic", "legendary"]),
  category: z.string().min(1).max(40),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

export const adminUpsertGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => giftSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("gifts")
      .upsert(clean(data))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await log(context.userId, row.id, data.id ? "update_gift" : "create_gift", "", data.name);
    return { id: row.id };
  });

const storeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  description: z.string().max(300).nullable().optional(),
  category: z.string().min(1).max(40),
  image_url: z.string().max(500).nullable().optional(),
  price: z.number().int().min(1).max(10_000_000),
  duration_days: z.number().int().min(1).max(3650).nullable().optional(),
  rarity: z.enum(["common", "rare", "epic", "legendary"]),
  required_vip: z.number().int().min(0).max(10),
  is_active: z.boolean(),
});

export const adminUpsertStoreItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => storeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("store_items")
      .upsert(clean(data))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await log(context.userId, row.id, data.id ? "update_store_item" : "create_store_item", "", data.name);
    return { id: row.id };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        table: z.enum(["gifts", "store_items", "coin_packages", "vip_levels"]),
        id: z.union([z.string().uuid(), z.number().int()]),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } =
      data.table === "vip_levels"
        ? await supabaseAdmin
            .from("vip_levels")
            .update({ is_active: data.active })
            .eq("level", Number(data.id))
        : await supabaseAdmin
            .from(data.table)
            .update({ is_active: data.active } as never)
            .eq("id", String(data.id));
    if (error) throw new Error(error.message);
    await log(context.userId, String(data.id), `set_active_${data.table}`, String(!data.active), String(data.active));
    return { ok: true };
  });

export const adminUpsertCoinPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(60),
        coins: z.number().int().min(1).max(100_000_000),
        bonus_coins: z.number().int().min(0).max(100_000_000),
        price_cents: z.number().int().min(0).max(100_000_000),
        currency: z.string().min(3).max(3),
        discount_percent: z.number().int().min(0).max(90),
        is_active: z.boolean(),
        sort_order: z.number().int().min(0).max(9999),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("coin_packages")
      .upsert(clean(data))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await log(context.userId, row.id, data.id ? "update_package" : "create_package", "", data.name);
    return { id: row.id };
  });

export const adminUpsertVipLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        level: z.number().int().min(1).max(10),
        name: z.string().min(1).max(60),
        price: z.number().int().min(1).max(100_000_000),
        duration_days: z.number().int().min(1).max(3650),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vip_levels").upsert(data);
    if (error) throw new Error(error.message);
    await log(context.userId, String(data.level), "upsert_vip_level", "", data.name);
    return { ok: true };
  });

export const adminSetGameSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        games: z.object({ dice: z.boolean(), wheel: z.boolean(), cards: z.boolean(), quiz: z.boolean() }),
        limits: z.object({
          min_bet: z.number().int().min(10).max(100_000),
          max_bet: z.number().int().min(10).max(100_000),
        }),
      })
      .refine((v) => v.limits.max_bet >= v.limits.min_bet, { message: "الحد الأعلى أقل من الأدنى" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert([
        { key: "games", value: data.games },
        { key: "limits", value: data.limits },
      ] as never);
    if (error) throw new Error(error.message);
    await log(context.userId, "settings", "update_game_settings", "", JSON.stringify(data));
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["super_admin", "admin", "moderator", "host", "user"]),
        grant: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    if (data.userId === context.userId && data.role === "super_admin" && !data.grant) {
      throw new Error("لا يمكنك إزالة صلاحيتك العامة");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await log(context.userId, data.userId, data.grant ? "grant_role" : "revoke_role", "", data.role);
    return { ok: true };
  });
