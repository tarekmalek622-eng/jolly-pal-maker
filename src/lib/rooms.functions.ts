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
    const { error } = await supabaseAdmin.rpc("badge_remove_room_participant", {
      _room_id: data.roomId,
      _target_id: data.targetId,
    });
    if (error) throw new Error(error.message);
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
    const { data: roundId, error } = await supabaseAdmin.rpc("badge_close_wheel_round", { _room_id: data.roomId });
    if (error) throw new Error(error.message);
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
