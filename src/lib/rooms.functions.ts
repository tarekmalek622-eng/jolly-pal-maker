import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function hasPermission(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
  permission: "room_background" | "participant_remove" | "wheel_close",
) {
  const { data, error } = await supabase.rpc("has_badge_permission", { _user_id: userId, _permission: permission });
  if (error) throw new Error("تعذر التحقق من صلاحية الشارة");
  return data === true;
}

export const getMyRoomBadgePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const checks = await Promise.all([
      hasPermission(context.supabase as never, context.userId, "room_background"),
      hasPermission(context.supabase as never, context.userId, "participant_remove"),
      hasPermission(context.supabase as never, context.userId, "wheel_close"),
    ]);
    return { roomBackground: checks[0], participantRemove: checks[1], wheelClose: checks[2] };
  });

export const updateOwnedRoomDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      roomId: z.string().uuid(),
      name: z.string().trim().min(2, "اسم الغرفة قصير").max(30, "اسم الغرفة طويل"),
      imageUrl: z.string().trim().max(500).nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const room = await context.supabase
      .from("rooms")
      .select("id, owner_id, name, image_url")
      .eq("id", data.roomId)
      .maybeSingle();
    if (room.error || !room.data) throw new Error("الغرفة غير موجودة");
    if (room.data.owner_id !== context.userId) throw new Error("تعديل بيانات الغرفة متاح لمالكها فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("rooms")
      .update({ name: data.name, image_url: data.imageUrl })
      .eq("id", data.roomId)
      .eq("owner_id", context.userId)
      .select("id, name, image_url")
      .maybeSingle();
    if (result.error || !result.data) throw new Error(result.error?.message ?? "تعذر تعديل الغرفة");

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.roomId,
      action: "room_details_updated",
      old_value: { name: room.data.name, image_url: room.data.image_url },
      new_value: { name: result.data.name, image_url: result.data.image_url },
    });
    return result.data;
  });

export const removeRoomParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid(), targetId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await hasPermission(context.supabase as never, context.userId, "participant_remove");
    const room = await context.supabase.from("rooms").select("owner_id").eq("id", data.roomId).maybeSingle();
    if (room.error || !room.data) throw new Error("الغرفة غير موجودة");
    const manager = room.data.owner_id === context.userId || allowed;
    if (!manager) throw new Error("لا تملك صلاحية سحب المشاركين");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.targetId === room.data.owner_id) throw new Error("لا يمكن سحب مالك الغرفة");
    const memberResult = await supabaseAdmin.from("room_members").delete().eq("room_id", data.roomId).eq("user_id", data.targetId);
    if (memberResult.error) throw new Error(memberResult.error.message);
    await supabaseAdmin.from("room_mics").update({ user_id: null, is_muted: false }).eq("room_id", data.roomId).eq("user_id", data.targetId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.targetId,
      action: "badge_room_participant_remove",
      new_value: { room_id: data.roomId },
    });
    return { ok: true };
  });

export const closeWheelRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const allowed = await hasPermission(context.supabase as never, context.userId, "wheel_close");
    const room = await context.supabase.from("rooms").select("owner_id").eq("id", data.roomId).maybeSingle();
    if (room.error || !room.data) throw new Error("الغرفة غير موجودة");
    if (room.data.owner_id !== context.userId && !allowed) throw new Error("لا تملك صلاحية إغلاق الجولة");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const round = await supabaseAdmin.from("wheel_rounds").select("id").eq("status", "betting").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (round.error) throw new Error(round.error.message);
    if (!round.data) throw new Error("لا توجد جولة مفتوحة");
    const { error } = await supabaseAdmin.rpc("wheel_settle", { _round_id: round.data.id });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: round.data.id,
      action: "badge_wheel_close",
      new_value: { room_id: data.roomId },
    });
    const roundId = round.data.id;
    return { ok: true, roundId };
  });

/** تطبيق عنصر تزيين مملوك على الغرفة أو على مقعد المايك — كل التحقق على السيرفر */
export const applyRoomCosmetic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { roomId: string; userItemId: string | null; target: "background" | "decoration" | "mic" }) =>
    z
      .object({
        roomId: z.string().uuid(),
        userItemId: z.string().uuid().nullable(),
        target: z.enum(["background", "decoration", "mic"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const room = await supabase
      .from("rooms")
      .select("id, owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (room.error || !room.data) throw new Error("الغرفة غير موجودة");

    // الخلفية والزينة لصاحب الغرفة فقط، وزينة المايك لصاحب المقعد
    const delegated = data.target !== "mic"
      ? await hasPermission(supabase as never, userId, "room_background")
      : false;
    if (data.target !== "mic" && room.data.owner_id !== userId && !delegated) {
      throw new Error("هذا الإجراء لصاحب الغرفة فقط");
    }

    let imageUrl: string | null = null;
    if (data.userItemId) {
      const owned = await supabase
        .from("user_items")
        .select("id, expires_at, store_items(category, image_url)")
        .eq("id", data.userItemId)
        .eq("user_id", userId)
        .maybeSingle();
      if (owned.error || !owned.data) throw new Error("لا تملك هذا العنصر");
      if (owned.data.expires_at && new Date(owned.data.expires_at).getTime() < Date.now()) {
        throw new Error("انتهت صلاحية هذا العنصر");
      }
      const item = owned.data.store_items as unknown as { category: string; image_url: string | null } | null;
      if (!item?.image_url) throw new Error("هذا العنصر بدون صورة");
      const allowed =
        data.target === "background"
          ? ["room_background"]
          : data.target === "decoration"
            ? ["room_decoration"]
            : ["mic_decoration"];
      if (!allowed.includes(item.category)) throw new Error("نوع العنصر لا يناسب هذا المكان");
      imageUrl = item.image_url;
    }

    // التحقق من الملكية والصلاحية تم أعلاه — الكتابة نفسها تتم بصلاحية سيرفر موثوقة
    // لأن جداول الغرف تمنع التعديل المباشر من المستخدمين
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.target === "background") {
      const res = await supabaseAdmin.from("rooms").update({ background_url: imageUrl }).eq("id", data.roomId);
      if (res.error) throw new Error(res.error.message);
    } else if (data.target === "decoration") {
      const res = await supabaseAdmin.from("rooms").update({ theme: imageUrl }).eq("id", data.roomId);
      if (res.error) throw new Error(res.error.message);
    } else {
      // زينة المايك تُخزَّن على حساب المستخدم نفسه لتبقى معه في أي مقعد يجلس عليه
      const res = await supabaseAdmin
        .from("profiles")
        .update({ mic_decoration_url: imageUrl } as never)
        .eq("id", userId);
      if (res.error) throw new Error(res.error.message);
      await supabaseAdmin.from("room_mics").update({ decoration_url: null }).eq("room_id", data.roomId).eq("user_id", userId);
    }

    return { ok: true, imageUrl };
  });

/** حفظ إعدادات صندوق الكنز وجوائز الغرف — للإدارة فقط */
export const adminSetRoomSystemsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        treasure: z.object({
          enabled: z.boolean(),
          levels: z
            .array(
              z.object({
                level: z.number().int().min(1).max(20),
                name: z.string().trim().min(1).max(40),
                target: z.number().int().min(1),
                prizes: z.array(z.object({ rank: z.number().int().min(1).max(20), coins: z.number().int().min(0) })).max(20),
              }),
            )
            .min(1)
            .max(20),
        }),
        rewards: z.object({
          min_weekly_cup: z.number().int().min(0),
          tiers: z
            .array(
              z.object({
                revenue: z.number().int().min(0),
                owner_coins: z.number().int().min(0),
                admin_coins: z.number().int().min(0),
                admins_min: z.number().int().min(0),
                admins_max: z.number().int().min(0),
                percent: z.number().int().min(0).max(100),
                weekly_cap: z.number().int().min(0),
              }),
            )
            .min(1)
            .max(30),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (admin.error || admin.data !== true) throw new Error("هذا الإجراء للإدارة فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("app_settings")
      .upsert([
        { key: "room_treasure", value: data.treasure },
        { key: "room_rewards", value: data.rewards },
      ] as never);
    if (res.error) throw new Error(res.error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "room_systems_settings_updated",
      new_value: data as never,
    });
    return { ok: true };
  });

/** تسوية مكافآت أسبوع لغرفة مسجّلة — للإدارة فقط */
export const adminSettleRoomRewardWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (admin.error || admin.data !== true) throw new Error("هذا الإجراء للإدارة فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.rpc("room_reward_settle_week", { _room_id: data.roomId, _week_start: data.weekStart });
    if (res.error) throw new Error(res.error.message);
    return { weekId: res.data as unknown as string };
  });
