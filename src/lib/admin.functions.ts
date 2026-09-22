import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/**
 * Authorizes an admin action. Full admins pass everything; users granted a
 * single admin section pass only actions belonging to that section.
 */
async function assertAdmin(supabase: Rpc, userId?: string, section?: string) {
  if (section && userId) {
    const { data, error } = await supabase.rpc("admin_has_section", { _user_id: userId, _section: section });
    if (error || data !== true) throw new Error("لا تملك صلاحية هذا القسم");
    return;
  }
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
        // الحد الأعلى للتعديل الإداري: ١٠٠ تريليون كوينز في العملية الواحدة
        amount: z.number().int().min(-100_000_000_000_000).max(100_000_000_000_000),
        reason: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "users");
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
    await assertAdmin(context.supabase as never, context.userId, "users");
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
    await assertAdmin(context.supabase as never, context.userId, "rooms");
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
    await assertAdmin(context.supabase as never, context.userId, "rooms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const previous = await supabaseAdmin.from("rooms").select("background_url").eq("id", data.roomId).maybeSingle();
    if (previous.error || !previous.data) throw new Error("الغرفة غير موجودة");
    const { error } = await supabaseAdmin.from("rooms").update({ background_url: data.backgroundUrl }).eq("id", data.roomId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.roomId, "admin_room_background", previous.data.background_url ?? "", data.backgroundUrl ?? "");
    return { ok: true };
  });

/** تعديل اسم الغرفة وصورتها ومالكها من لوحة الإدارة — كل التحقق على الخادم مع تسجيل الإجراء */
export const adminUpdateRoomDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        roomId: z.string().uuid(),
        name: z.string().trim().min(2, "اسم الغرفة قصير").max(30, "اسم الغرفة طويل"),
        imageUrl: z.string().trim().max(500).nullable(),
        ownerPublicId: z.string().trim().max(30).nullable(),
        roomCode: z
          .string()
          .trim()
          .regex(/^[0-9]{4,10}$/, "معرّف الغرفة يجب أن يكون من 4 إلى 10 أرقام")
          .nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "rooms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const previous = await supabaseAdmin
      .from("rooms")
      .select("id, name, image_url, owner_id, room_code")
      .eq("id", data.roomId)
      .maybeSingle();
    if (previous.error || !previous.data) throw new Error("الغرفة غير موجودة");

    let roomCode = previous.data.room_code;
    if (data.roomCode && data.roomCode !== roomCode) {
      const taken = await supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("room_code", data.roomCode)
        .neq("id", data.roomId)
        .maybeSingle();
      if (taken.error) throw new Error(taken.error.message);
      if (taken.data) throw new Error("هذا المعرّف مستخدم في غرفة أخرى");
      roomCode = data.roomCode;
    }

    let ownerId = previous.data.owner_id;
    if (data.ownerPublicId) {
      const owner = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("public_id", data.ownerPublicId)
        .maybeSingle();
      if (owner.error) throw new Error(owner.error.message);
      if (!owner.data) throw new Error("لا يوجد مستخدم بهذا المعرّف");
      ownerId = owner.data.id;
    }

    const result = await supabaseAdmin
      .from("rooms")
      .update({ name: data.name, image_url: data.imageUrl, owner_id: ownerId, room_code: roomCode })
      .eq("id", data.roomId)
      .select("id, name, image_url, owner_id, room_code")
      .maybeSingle();
    if (result.error || !result.data) throw new Error(result.error?.message ?? "تعذر تعديل الغرفة");

    await log(
      context.userId,
      data.roomId,
      "admin_room_details",
      JSON.stringify({ name: previous.data.name, image_url: previous.data.image_url, owner_id: previous.data.owner_id, room_code: previous.data.room_code }),
      JSON.stringify({ name: result.data.name, image_url: result.data.image_url, owner_id: result.data.owner_id, room_code: result.data.room_code }),
    );
    return result.data;
  });

export const adminCloseWheelRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "gameEngine");
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
    await assertAdmin(context.supabase as never, context.userId, "reports");
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
    await assertAdmin(context.supabase as never, context.userId, "gifts");
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
    await assertAdmin(context.supabase as never, context.userId, "gifts");
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
    await assertAdmin(context.supabase as never, context.userId, "store");
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
    await assertAdmin(context.supabase as never, context.userId, "coins");
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
    await assertAdmin(context.supabase as never, context.userId, "vip");
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
    await assertAdmin(context.supabase as never, context.userId, "cvip");
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
    await assertAdmin(context.supabase as never, context.userId, "games");
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
    await assertAdmin(context.supabase as never, context.userId, "games");
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
    await assertAdmin(context.supabase as never, context.userId, "users");
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
        role: z.enum(["super_admin", "admin", "moderator", "host", "user", "welcome_manager"]),
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
        .upsert({ user_id: data.userId, role: data.role } as never, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role as never);
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
    displayVariant: z.enum(["crest", "ribbon", "medal", "glass"]),
    audience: z.enum(["assigned", "admin", "moderator", "host", "vip", "all"]),
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
    await assertAdmin(context.supabase as never, context.userId, "users");
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
    await assertAdmin(context.supabase as never, context.userId, "quiz");
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
    await assertAdmin(context.supabase as never, context.userId, "quiz");
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
    await assertAdmin(context.supabase as never, context.userId, "games");
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
    await assertAdmin(context.supabase as never, context.userId, "topups");
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
    await assertAdmin(context.supabase as never, context.userId, "topups");
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
          .regex(/^[A-Za-z0-9]{1,12}$/, "الـID يقبل حروفًا أو أرقامًا من خانة واحدة إلى 12")
          .optional(),

        displayName: z.string().trim().min(2).max(30).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "users");
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

/** إنشاء غرفة جديدة من لوحة الإدارة — تُنشأ بحساب الإدارة ثم يمكن إسنادها لمالك آخر */
export const adminCreateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2, "اسم الغرفة قصير").max(30, "اسم الغرفة طويل"),
        description: z.string().trim().max(200).nullable(),
        category: z.string().trim().min(1).max(30),
        roomType: z.enum(["public", "private"]),
        password: z.string().trim().max(30).nullable(),
        micCount: z.number().int().min(1).max(20),
        imageUrl: z.string().trim().max(500).nullable(),
        ownerPublicId: z.string().trim().max(30).nullable(),
        roomCode: z
          .string()
          .trim()
          .regex(/^[0-9]{4,10}$/, "معرّف الغرفة يجب أن يكون من 4 إلى 10 أرقام")
          .nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "rooms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ownerId = context.userId;
    if (data.ownerPublicId) {
      const owner = await supabaseAdmin.from("profiles").select("id").eq("public_id", data.ownerPublicId).maybeSingle();
      if (owner.error) throw new Error(owner.error.message);
      if (!owner.data) throw new Error("لا يوجد مستخدم بهذا المعرّف");
      ownerId = owner.data.id;
    }

    const mics = Math.min(16, Math.max(4, data.micCount));
    const code = await (supabaseAdmin as unknown as Rpc).rpc("gen_room_code", {});
    if (code.error) throw new Error((code.error as { message?: string }).message ?? "تعذر توليد رقم الغرفة");

    const created = await supabaseAdmin
      .from("rooms")
      .insert({
        room_code: String(code.data),
        name: data.name,
        description: data.description,
        category: data.category,
        room_type: data.roomType,
        password: data.roomType === "private" && data.password ? data.password : null,
        mic_count: mics,
        owner_id: ownerId,
        image_url: data.imageUrl,
      })
      .select("id, room_code, name")
      .single();
    if (created.error) throw new Error(created.error.message);
    const room = created.data as { id: string; room_code: string; name: string };

    const seats = Array.from({ length: mics }, (_, i) => ({ room_id: room.id, seat_index: i + 1 }));
    const mic = await supabaseAdmin.from("room_mics").insert(seats);
    if (mic.error) throw new Error(mic.error.message);

    await log(context.userId, room.id, "admin_room_created", "", JSON.stringify({ name: room.name, code: room.room_code, owner_id: ownerId }));
    return room;
  });

/** منح أو سحب صلاحية مشرف داخل غرفة محددة */
export const adminSetRoomModerator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), publicId: z.string().trim().min(3).max(30), enable: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "rooms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await supabaseAdmin.from("profiles").select("id").eq("public_id", data.publicId).maybeSingle();
    if (target.error) throw new Error(target.error.message);
    if (!target.data) throw new Error("لا يوجد مستخدم بهذا المعرّف");
    if (data.enable) {
      const { error } = await supabaseAdmin
        .from("room_moderators")
        .upsert({ room_id: data.roomId, user_id: target.data.id }, { onConflict: "room_id,user_id" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("room_moderators")
        .delete()
        .eq("room_id", data.roomId)
        .eq("user_id", target.data.id);
      if (error) throw new Error(error.message);
    }
    await log(context.userId, data.roomId, data.enable ? "admin_room_mod_added" : "admin_room_mod_removed", "", target.data.id);
    return { ok: true };
  });

/** إخراج مشارك من الغرفة وإنزاله من المايك */
export const adminRemoveRoomMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid(), userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "rooms");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const room = await supabaseAdmin.from("rooms").select("owner_id").eq("id", data.roomId).maybeSingle();
    if (room.error || !room.data) throw new Error("الغرفة غير موجودة");
    if (room.data.owner_id === data.userId) throw new Error("لا يمكن إخراج مالك الغرفة");
    await supabaseAdmin.from("room_mics").update({ user_id: null }).eq("room_id", data.roomId).eq("user_id", data.userId);
    const { error } = await supabaseAdmin.from("room_members").delete().eq("room_id", data.roomId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.roomId, "admin_room_member_removed", data.userId, "");
    return { ok: true };
  });

/** حذف رسالة من دردشة الغرفة */
export const adminDeleteRoomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "roomMessages");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const previous = await supabaseAdmin
      .from("room_messages")
      .select("id, room_id, user_id, body")
      .eq("id", data.messageId)
      .maybeSingle();
    if (previous.error || !previous.data) throw new Error("الرسالة غير موجودة");
    const { error } = await supabaseAdmin.from("room_messages").delete().eq("id", data.messageId);
    if (error) throw new Error(error.message);
    await log(context.userId, previous.data.room_id, "admin_room_message_deleted", previous.data.body, "");
    return { ok: true };
  });

/** إعادة إرسال رسالة داخل نفس الغرفة باسم صاحبها الأصلي */
export const adminResendRoomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "roomMessages");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const source = await supabaseAdmin
      .from("room_messages")
      .select("room_id, user_id, body, kind, metadata")
      .eq("id", data.messageId)
      .maybeSingle();
    if (source.error || !source.data) throw new Error("الرسالة غير موجودة");
    const inserted = await supabaseAdmin
      .from("room_messages")
      .insert({
        room_id: source.data.room_id,
        user_id: source.data.user_id,
        body: source.data.body,
        kind: source.data.kind,
        metadata: source.data.metadata,
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "تعذر إعادة الإرسال");
    await log(context.userId, source.data.room_id, "admin_room_message_resent", data.messageId, inserted.data.id);
    return inserted.data;
  });

/* ---------------- بنرات الرئيسية (إعلانات / أحداث / مسابقات) ---------------- */

const bannerSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(80),
  subtitle: z.string().max(200).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  linkUrl: z.string().max(500).nullable().optional(),
  kind: z.enum(["ad", "event", "contest"]),
  startsAt: z.string().max(40).nullable().optional(),
  endsAt: z.string().max(40).nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export const adminUpsertBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bannerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "banners");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      title: data.title,
      subtitle: data.subtitle ?? null,
      image_url: data.imageUrl ?? null,
      link_url: data.linkUrl ?? null,
      kind: data.kind,
      starts_at: data.startsAt || null,
      ends_at: data.endsAt || null,
      is_active: data.isActive,
      sort_order: data.sortOrder,
      created_by: context.userId,
    };
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (v: unknown) => { select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } };
        update: (v: unknown) => { eq: (c: string, v2: string) => { select: (c2: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } } };
        delete: () => { eq: (c: string, v2: string) => Promise<{ error: { message: string } | null }> };
      };
    };
    const result = data.id
      ? await db.from("banners").update(row).eq("id", data.id).select("id").maybeSingle()
      : await db.from("banners").insert(row).select("id").maybeSingle();
    if (result.error || !result.data) throw new Error(result.error?.message ?? "تعذر حفظ البنر");
    await log(context.userId, result.data.id, data.id ? "admin_banner_updated" : "admin_banner_created", "", data.title);
    return result.data;
  });

export const adminDeleteBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId, "banners");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } } };
    const { error } = await db.from("banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(context.userId, data.id, "admin_banner_deleted", "", "");
    return { ok: true };
  });

/** Admin panel sections that can be delegated to a non-admin account. */
export const ADMIN_SECTION_KEYS = [
  "users",
  "rooms",
  "roomMessages",
  "banners",
  "badges",
  "gifts",
  "store",
  "vip",
  "cvip",
  "coins",
  "topups",
  "games",
  "gameEngine",
  "quiz",
  "reports",
  "welcome",
  "roomSystems",
  "families",
  "logs",
] as const;

/** Grants a user access to specific admin sections only (super admin action). */
export const adminSetUserSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        sections: z.array(z.enum(ADMIN_SECTION_KEYS)).max(ADMIN_SECTION_KEYS.length),
        note: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const unique = [...new Set(data.sections)];
    if (unique.length === 0) {
      const { error } = await supabaseAdmin.from("admin_sections").delete().eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("admin_sections")
        .upsert(
          {
            user_id: data.userId,
            sections: unique,
            granted_by: context.userId,
            note: data.note ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "user_id" },
        );
      if (error) throw new Error(error.message);
    }
    await log(context.userId, data.userId, "set_admin_sections", "", unique.join(","));
    return { ok: true, sections: unique };
  });

/** Reads the admin sections granted to a user (super admin action). */
export const adminGetUserSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("admin_sections")
      .select("sections, note")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { sections: (row?.sections ?? []) as string[], note: row?.note ?? null };
  });
