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
    await assertAdmin(context.supabase as never, context.userId);
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
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_set_profile_suspended", {
      _user_id: data.userId,
      _suspended: data.suspended,
    });
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
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rooms")
      .update({ is_disabled: data.disabled })
      .eq("id", data.roomId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.roomId, "set_room_disabled", String(!data.disabled), String(data.disabled));
    return { ok: true };
  });

export const adminUpdateRoomBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), backgroundUrl: z.string().max(500).nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const previous = await supabaseAdmin.from("rooms").select("background_url").eq("id", data.roomId).maybeSingle();
    if (previous.error || !previous.data) throw new Error("الغرفة غير موجودة");
    const { error } = await supabaseAdmin.from("rooms").update({ background_url: data.backgroundUrl }).eq("id", data.roomId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.roomId, "admin_room_background", previous.data.background_url ?? "", data.backgroundUrl ?? "");
    return { ok: true };
  });

export const adminCloseWheelRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const round = await supabaseAdmin.from("wheel_rounds").select("id, round_no").eq("status", "betting").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (round.error) throw new Error(round.error.message);
    if (!round.data) throw new Error("لا توجد جولة مفتوحة");
    const settled = await supabaseAdmin.rpc("wheel_settle", { _round_id: round.data.id });
    if (settled.error) throw new Error(settled.error.message);
    const result = await supabaseAdmin.from("wheel_rounds").select("id, round_no, status, winning_key").eq("id", round.data.id).single();
    if (result.error) throw new Error(result.error.message);
    await log(context.userId, round.data.id, "admin_wheel_close", "betting", JSON.stringify({ room_id: data.roomId, winning_key: result.data.winning_key }));
    return result.data;
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ reportId: z.string().uuid(), status: z.enum(["resolved", "rejected", "pending"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
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
  thumb_url: z.string().max(500).nullable().optional(),
  animation_url: z.string().max(500).nullable().optional(),
  video_url: z.string().max(500).nullable().optional(),
  sound_url: z.string().max(500).nullable().optional(),
  sound_enabled: z.boolean().optional(),
  duration_ms: z.number().int().min(800).max(12_000).optional(),
  display_scale: z.number().int().min(20).max(200).optional(),
  required_vip: z.number().int().min(0).max(10).optional(),
  price: z.number().int().min(0).max(10_000_000),
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

export const adminDeleteGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gift } = await supabaseAdmin.from("gifts").select("name").eq("id", data.id).maybeSingle();
    const { count } = await supabaseAdmin
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("gift_id", data.id);
    if ((count ?? 0) > 0) {
      // الهدية مستخدمة في سجل عمليات — نخفيها بدل حذف السجل
      const { error } = await supabaseAdmin.from("gifts").update({ is_active: false }).eq("id", data.id);
      if (error) throw new Error(error.message);
      await log(context.userId, data.id, "hide_gift", gift?.name ?? "", "مخفية (لها سجل إرسال)");
      return { deleted: false, hidden: true };
    }
    const { error } = await supabaseAdmin.from("gifts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(context.userId, data.id, "delete_gift", gift?.name ?? "", "");
    return { deleted: true, hidden: false };
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
        table: z.enum(["gifts", "store_items", "coin_packages", "vip_levels", "cvip_plans"]),
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
        badge_url: z.string().max(500).nullable().optional(),
        frame_url: z.string().max(500).nullable().optional(),
        name_effect: z.string().max(500).nullable().optional(),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      level: data.level,
      name: data.name,
      price: data.price,
      duration_days: data.duration_days,
      badge_url: data.badge_url ?? null,
      frame_url: data.frame_url ?? null,
      name_effect: data.name_effect ?? null,
      is_active: data.is_active,
    };
    const { error } = await supabaseAdmin.from("vip_levels").upsert(payload);
    if (error) throw new Error(error.message);
    await log(context.userId, String(data.level), "upsert_vip_level", "", data.name);
    return { ok: true };
  });

export const adminUpsertCvipPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
        price: z.number().int().min(1).max(100_000_000),
        duration_days: z.number().int().min(1).max(3650),
        sort_order: z.number().int().min(0).max(1000),
        badge_url: z.string().max(2000).optional(),
        frame_url: z.string().max(2000).optional(),
        background_url: z.string().max(2000).optional(),
        name_effect: z.string().max(2000).optional(),
        room_effect: z.string().max(2000).optional(),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const row = {
      ...rest,
      description: rest.description || null,
      badge_url: rest.badge_url || null,
      frame_url: rest.frame_url || null,
      background_url: rest.background_url || null,
      name_effect: rest.name_effect || null,
      room_effect: rest.room_effect || null,
    };
    const { error } = id
      ? await supabaseAdmin.from("cvip_plans").update(row).eq("id", id)
      : await supabaseAdmin.from("cvip_plans").insert(row);
    if (error) throw new Error(error.message);
    await log(context.userId, id ?? "new", "upsert_cvip_plan", "", data.name);
    return { ok: true };
  });

export const adminSetGameSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        games: z.object({
          dice: z.boolean(),
          wheel: z.boolean(),
          cards: z.boolean(),
          quiz: z.boolean(),
          domino: z.boolean(),
        }),
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

export const adminSetWheelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        duration_seconds: z.number().int().min(5).max(120),
        result_seconds: z.number().int().min(1).max(30),
        min_bet: z.number().int().min(1).max(1_000_000),
        max_bet: z.number().int().min(1).max(10_000_000),
        slots: z
          .array(
            z.object({
              key: z.string().min(1).max(32),
              label: z.string().min(1).max(40),
              emoji: z.string().min(1).max(8),
              multiplier: z.number().min(0).max(1000),
              weight: z.number().min(0.01).max(1000),
            }),
          )
          .min(2)
          .max(16),
      })
      .refine((v) => v.max_bet >= v.min_bet, { message: "الحد الأعلى أقل من الأدنى" })
      .refine((v) => new Set(v.slots.map((s) => s.key)).size === v.slots.length, { message: "مفاتيح الخانات مكررة" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert([{ key: "wheel", value: data }] as never);
    if (error) throw new Error(error.message);
    await log(context.userId, "settings", "update_wheel_settings", "", JSON.stringify(data));
    return { ok: true };
  });

export const adminSetRelationshipSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        couple: z.boolean(),
        soulmate: z.boolean(),
        favorite_friend: z.boolean(),
        close_friend: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert([{ key: "relationships", value: data }] as never);
    if (error) throw new Error(error.message);
    await log(context.userId, "settings", "update_relationship_settings", "", JSON.stringify(data));
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

export const adminSetUserBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), badgeId: z.string().uuid(), grant: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: badge, error: badgeError } = await supabaseAdmin
      .from("badge_definitions")
      .select("id, name, kind")
      .eq("id", data.badgeId)
      .eq("kind", "administrative")
      .eq("is_active", true)
      .maybeSingle();
    if (badgeError) throw new Error(badgeError.message);
    if (!badge) throw new Error("الشارة الإدارية غير متاحة");

    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_badges")
        .upsert({ user_id: data.userId, badge_id: data.badgeId, progress: 1 }, { onConflict: "user_id,badge_id" });
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("notifications").insert({
        user_id: data.userId,
        kind: "admin_badge",
        title: "تم منحك شارة إدارية",
        body: badge.name,
        metadata: { badge_id: badge.id },
      });
    } else {
      const { error } = await supabaseAdmin
        .from("user_badges")
        .delete()
        .eq("user_id", data.userId)
        .eq("badge_id", data.badgeId);
      if (error) throw new Error(error.message);
    }
    await log(context.userId, data.userId, data.grant ? "grant_admin_badge" : "revoke_admin_badge", "", badge.name);
    return { ok: true };
  });

export const adminUpsertBadgeDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    key: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
    name: z.string().min(2).max(60),
    description: z.string().max(240).nullable().optional(),
    kind: z.enum(["administrative", "achievement"]),
    imageUrl: z.string().url().max(2000).nullable().optional(),
    iconKey: z.string().max(40),
    colorKey: z.string().max(40),
    displayVariant: z.enum(["crest", "pill", "image"]),
    audience: z.enum(["profile", "room", "both"]),
    sortOrder: z.number().int().min(0).max(10000),
    threshold: z.number().int().min(0).max(100000000),
    isActive: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      key: data.key,
      name: data.name,
      description: data.description ?? null,
      kind: data.kind,
      image_url: data.imageUrl ?? null,
      icon_key: data.iconKey,
      color_key: data.colorKey,
      display_variant: data.displayVariant,
      audience: data.audience,
      style_key: data.colorKey,
      sort_order: data.sortOrder,
      threshold: data.threshold,
      is_active: data.isActive,
    };
    const result = data.id
      ? await supabaseAdmin.from("badge_definitions").update(payload).eq("id", data.id).select("id").single()
      : await supabaseAdmin.from("badge_definitions").insert(payload).select("id").single();
    if (result.error) throw new Error(result.error.message);
    await log(context.userId, result.data.id, data.id ? "update_badge_definition" : "create_badge_definition", "", data.name);
    return { id: result.data.id };
  });

export const adminEndRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ relationshipId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: ended, error } = await (context.supabase as unknown as Rpc).rpc("admin_end_relationship", {
      _relationship_id: data.relationshipId,
    });
    if (error) throw new Error(error instanceof Error ? error.message : "تعذر إنهاء العلاقة");
    return { ok: ended === true };
  });

export const adminUpsertQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        question: z.string().min(5).max(300),
        choices: z.array(z.string().min(1).max(120)).length(4),
        correct_index: z.number().int().min(0).max(3),
        difficulty: z.number().int().min(1).max(5),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      question: data.question,
      choices: data.choices,
      correct_index: data.correct_index,
      difficulty: data.difficulty,
      is_active: data.is_active,
    };
    const query = data.id
      ? supabaseAdmin.from("quiz_questions").update(payload).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("quiz_questions").insert(payload).select("id").single();
    const { data: row, error } = await query;
    if (error) throw new Error(error.message);
    await log(context.userId, row.id, data.id ? "update_quiz_question" : "create_quiz_question", "", data.question);
    return { id: row.id };
  });

export const adminDeleteQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("quiz_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(context.userId, data.id, "delete_quiz_question", "", "");
    return { ok: true };
  });

/* ---------------- إعدادات الدومينو ---------------- */

export const adminSetDominoSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        min_bet: z.number().int().min(10).max(100_000),
        max_bet: z.number().int().min(10).max(100_000),
        payout_multiplier: z.number().min(1).max(5),
        refund_hours: z.number().int().min(1).max(720),
      })
      .refine((v) => v.max_bet >= v.min_bet, { message: "الحد الأعلى أقل من الأدنى" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert([{ key: "domino", value: data }] as never);
    if (error) throw new Error(error.message);
    await log(context.userId, "domino", "update_domino_settings", "", JSON.stringify(data));
    return { ok: true };
  });

/* ---------------- طلبات شراء الكوينز (تحويل محلي) ---------------- */

export const adminReviewCoinPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.approve) {
      const client = supabaseAdmin as unknown as {
        rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const { error } = await client.rpc("approve_coin_purchase", { _request_id: data.id, _admin: context.userId });
      if (error) throw new Error(error.message);
      await log(context.userId, data.id, "approve_coin_purchase", "pending", "approved");
      return { ok: true };
    }

    const { data: row, error: readError } = await supabaseAdmin
      .from("coin_purchase_requests")
      .select("id, user_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("الطلب غير موجود");
    if (row.status !== "pending") throw new Error("تمت مراجعة الطلب بالفعل");

    const { error } = await supabaseAdmin
      .from("coin_purchase_requests")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        note: data.note ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: row.user_id,
      kind: "wallet",
      title: "تم رفض طلب الشراء",
      body: data.note ?? "لم يتم التحقق من التحويل. تواصل مع الدعم.",
    } as never);
    await log(context.userId, data.id, "reject_coin_purchase", "pending", "rejected");
    return { ok: true };
  });

export const adminSetPaymentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        vodafone_cash: z.string().trim().max(40),
        instapay: z.string().trim().max(80),
        instructions: z.string().trim().max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert([{ key: "payment_accounts", value: data }] as never);
    if (error) throw new Error(error.message);
    await log(context.userId, "payment_accounts", "update_payment_accounts", "", JSON.stringify(data));
    return { ok: true };
  });

/* ---------------- تعديل هوية المستخدم (الاسم / ID) ---------------- */

export const adminUpdateUserIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        publicId: z
          .string()
          .trim()
          .regex(/^[0-9]{4,12}$/, "الـID يجب أن يكون أرقامًا من 4 إلى 12 خانة")
          .optional(),
        displayName: z.string().trim().min(2).max(30).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("public_id, display_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("المستخدم غير موجود");

    const patch: Record<string, unknown> = {};
    if (data.publicId && data.publicId !== current.public_id) {
      const { data: taken, error: takenError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("public_id", data.publicId)
        .maybeSingle();
      if (takenError) throw new Error(takenError.message);
      if (taken) throw new Error("هذا الـID مستخدم بالفعل");
      patch['public_id'] = data.publicId;
    }
    if (data.displayName && data.displayName !== current.display_name) {
      patch['display_name'] = data.displayName;
    }
    if (Object.keys(patch).length === 0) return { ok: true, changed: false };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    // عند تغيير الـID: يصبح كود غرفة المستخدم نفس الـID الشخصي + إشعار له
    if (patch['public_id']) {
      const newId = String(patch['public_id']);
      const { data: myRoom } = await supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("owner_id", data.userId)
        .eq("is_active", true)
        .maybeSingle();
      if (myRoom) {
        const { data: codeTaken } = await supabaseAdmin
          .from("rooms")
          .select("id")
          .eq("room_code", newId)
          .maybeSingle();
        if (!codeTaken) {
          await supabaseAdmin.from("rooms").update({ room_code: newId } as never).eq("id", myRoom.id);
        }
      }
      await supabaseAdmin.from("notifications").insert({
        user_id: data.userId,
        kind: "system",
        title: "تم تغيير الـID الخاص بك",
        body: `الـID الجديد: ${newId}${myRoom ? " — وأصبح كود غرفتك بنفس الـID" : ""}`,
        metadata: { old_public_id: current.public_id, new_public_id: newId },
      } as never);
    }

    await log(
      context.userId,
      data.userId,
      "update_user_identity",
      JSON.stringify({ public_id: current.public_id, display_name: current.display_name }),
      JSON.stringify(patch),
    );
    return { ok: true, changed: true };
  });
