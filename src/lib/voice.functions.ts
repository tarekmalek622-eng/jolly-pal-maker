import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SignJWT } from "jose";

type TokenInput = { roomId: string; canPublish: boolean };

/**
 * Issues a short-lived LiveKit access token for a room the caller is a member of.
 * Publish rights are only granted when the caller actually holds a mic seat.
 */
export const getVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: TokenInput) => {
    if (!data?.roomId || typeof data.roomId !== "string") throw new Error("roomId required");
    return { roomId: data.roomId, canPublish: Boolean(data.canPublish) };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LIVEKIT_API_KEY"];
    const apiSecret = process.env["LIVEKIT_API_SECRET"];
    const wsUrl = process.env["LIVEKIT_URL"];

    if (!apiKey || !apiSecret || !wsUrl) {
      return { configured: false as const, token: null, url: null };
    }

    const { supabase, userId } = context;

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, is_active, is_disabled")
      .eq("id", data.roomId)
      .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room || room.is_disabled || !room.is_active) {
      return { configured: false as const, token: null, url: null, reason: "الغرفة غير متاحة" };
    }

    const { data: ban } = await supabase
      .from("bans")
      .select("id")
      .eq("user_id", userId)
      .or(`room_id.eq.${data.roomId},scope.eq.global`)
      .limit(1);
    if (ban && ban.length > 0) {
      return { configured: false as const, token: null, url: null, reason: "أنت محظور من هذه الغرفة" };
    }

    let canPublish = false;
    if (data.canPublish) {
      const { data: seat } = await supabase
        .from("room_mics")
        .select("id, is_muted")
        .eq("room_id", data.roomId)
        .eq("user_id", userId)
        .maybeSingle();
      canPublish = Boolean(seat && !seat.is_muted);
    }

    const secret = new TextEncoder().encode(apiSecret);
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      video: {
        room: data.roomId,
        roomJoin: true,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(apiKey)
      .setSubject(userId)
      .setJti(`${userId}-${now}`)
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 6)
      .sign(secret);

    return { configured: true as const, token, url: wsUrl, canPublish, reason: null };
  });
