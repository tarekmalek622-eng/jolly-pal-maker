import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SignJWT } from "jose";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type TokenInput = { roomId: string; canPublish: boolean };

/** تحقق مشترك: الغرفة متاحة + المستخدم مش محظور + صلاحية النشر من مقعد المايك. */
async function checkVoiceAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  roomId: string,
  wantsPublish: boolean,
) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, is_active, is_disabled")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) throw new Error(roomError.message);
  if (!room || room.is_disabled || !room.is_active) {
    return { ok: false as const, reason: "الغرفة غير متاحة", canPublish: false };
  }

  const { data: ban } = await supabase
    .from("bans")
    .select("id")
    .eq("user_id", userId)
    .or(`room_id.eq.${roomId},scope.eq.global`)
    .limit(1);
  if (ban && ban.length > 0) {
    return { ok: false as const, reason: "أنت محظور من هذه الغرفة", canPublish: false };
  }

  let canPublish = false;
  if (wantsPublish) {
    const { data: seat } = await supabase
      .from("room_mics")
      .select("id, is_muted")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    canPublish = Boolean(seat && !seat.is_muted);
  }
  return { ok: true as const, reason: null, canPublish };
}

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
    // كل مجموعات مفاتيح LiveKit المتاحة — النظام يبدّل بينها تلقائيًا كل 9899 دقيقة
    const configs = [
      {
        key: process.env["LIVEKIT_API_KEY"],
        secret: process.env["LIVEKIT_API_SECRET"],
        url: process.env["LIVEKIT_URL"],
      },
      {
        key: process.env["LIVEKIT_API_KEY_2"],
        secret: process.env["LIVEKIT_API_SECRET_2"],
        url: process.env["LIVEKIT_URL_2"],
      },
    ].filter((c): c is { key: string; secret: string; url: string } =>
      Boolean(c.key && c.secret && c.url),
    );

    if (configs.length === 0) {
      return { configured: false as const, token: null, url: null };
    }

    // التبديل الدوري: كل 9899 دقيقة ينتقل للمجموعة التالية
    const ROTATE_MS = 9899 * 60 * 1000;
    const activeIdx = Math.floor(Date.now() / ROTATE_MS) % configs.length;
    const active = configs[activeIdx];
    const backup = configs.length > 1 ? configs[(activeIdx + 1) % configs.length] : null;

    const { supabase, userId } = context;

    const access = await checkVoiceAccess(supabase, userId, data.roomId, data.canPublish);
    if (!access.ok) {
      return { configured: false as const, token: null, url: null, reason: access.reason };
    }
    const canPublish = access.canPublish;

    const signLiveKitToken = async (key: string, secretValue: string) => {
      const secret = new TextEncoder().encode(secretValue);
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        video: {
          room: data.roomId,
          roomJoin: true,
          canPublish,
          canSubscribe: true,
          canPublishData: true,
        },
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(key)
        .setSubject(userId)
        .setJti(`${userId}-${now}`)
        .setIssuedAt(now)
        .setExpirationTime(now + 60 * 60 * 6)
        .sign(secret);
    };

    const token = await signLiveKitToken(apiKey, apiSecret);

    // مفاتيح احتياطية: لو السيرفر الأساسي فصل يتجرّب التاني تلقائيًا
    const apiKey2 = process.env["LIVEKIT_API_KEY_2"];
    const apiSecret2 = process.env["LIVEKIT_API_SECRET_2"];
    const wsUrl2 = process.env["LIVEKIT_URL_2"];
    let backupToken: string | null = null;
    let backupUrl: string | null = null;
    if (apiKey2 && apiSecret2 && wsUrl2) {
      backupToken = await signLiveKitToken(apiKey2, apiSecret2);
      backupUrl = wsUrl2;
    }

    return {
      configured: true as const,
      token,
      url: wsUrl,
      canPublish,
      reason: null,
      backupToken,
      backupUrl,
    };
  });

/**
 * مزود الصوت الاحتياطي (Agora — الخطة المجانية): يُستخدم تلقائيًا عند فشل LiveKit.
 * يحتاج متغيري البيئة AGORA_APP_ID و AGORA_APP_CERTIFICATE.
 */
export const getAgoraVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: TokenInput) => {
    if (!data?.roomId || typeof data.roomId !== "string") throw new Error("roomId required");
    return { roomId: data.roomId, canPublish: Boolean(data.canPublish) };
  })
  .handler(async ({ data, context }) => {
    const appId = process.env["AGORA_APP_ID"];
    const appCertificate = process.env["AGORA_APP_CERTIFICATE"];

    if (!appId || !appCertificate) {
      return { configured: false as const, token: null, appId: null, channel: null };
    }

    const { supabase, userId } = context;
    const access = await checkVoiceAccess(supabase, userId, data.roomId, data.canPublish);
    if (!access.ok) {
      return {
        configured: false as const,
        token: null,
        appId: null,
        channel: null,
        reason: access.reason,
      };
    }

    // agora-token مكتبة CommonJS — استيراد ديناميكي داخل المعالج لتفادي مشاكل التحويل
    const mod = (await import("agora-token")) as unknown as
      | { RtcTokenBuilder: typeof import("agora-token").RtcTokenBuilder; RtcRole: typeof import("agora-token").RtcRole }
      | { default: { RtcTokenBuilder: typeof import("agora-token").RtcTokenBuilder; RtcRole: typeof import("agora-token").RtcRole } };
    const agora = "RtcTokenBuilder" in mod ? mod : mod.default;

    const now = Math.floor(Date.now() / 1000);
    const expireAt = now + 60 * 60 * 6;
    // uid = 0 يعني أن Agora تعيّن رقمًا تلقائيًا عند الانضمام
    const token = agora.RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      data.roomId,
      0,
      agora.RtcRole.PUBLISHER,
      expireAt,
      expireAt,
    );

    return {
      configured: true as const,
      token,
      appId,
      channel: data.roomId,
      canPublish: access.canPublish,
      reason: null,
    };
  });
