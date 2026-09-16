import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    if (data.target !== "mic" && room.data.owner_id !== userId) {
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

    if (data.target === "background") {
      const res = await supabase.from("rooms").update({ background_url: imageUrl }).eq("id", data.roomId);
      if (res.error) throw new Error(res.error.message);
    } else if (data.target === "decoration") {
      const res = await supabase.from("rooms").update({ theme: imageUrl }).eq("id", data.roomId);
      if (res.error) throw new Error(res.error.message);
    } else {
      const seat = await supabase
        .from("room_mics")
        .select("id")
        .eq("room_id", data.roomId)
        .eq("user_id", userId)
        .maybeSingle();
      if (seat.error || !seat.data) throw new Error("اصعد على المايك أولًا");
      const res = await supabase.from("room_mics").update({ decoration_url: imageUrl }).eq("id", seat.data.id);
      if (res.error) throw new Error(res.error.message);
    }

    return { ok: true, imageUrl };
  });
