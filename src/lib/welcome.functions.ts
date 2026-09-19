import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** الترحيبية متاحة للإدارة ولحاملي رتبة مسؤول الترحيبية فقط. */
async function assertWelcomeManager(supabase: Rpc, userId: string) {
  const [admin, manager] = await Promise.all([
    supabase.rpc("is_admin", { _user_id: userId }),
    supabase.rpc("has_role", { _user_id: userId, _role: "welcome_manager" }),
  ]);
  if (admin.data === true) return;
  if (manager.data === true) return;
  throw new Error("هذه العملية لمسؤول الترحيبية أو الإدارة فقط");
}

const WELCOME_COINS = 1_000_000_000;
const WELCOME_VIP_LEVEL = 3;
const WELCOME_VIP_DAYS = 7;

export const listWelcomeClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ search: z.string().max(60).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertWelcomeManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    await db.rpc("expire_due_vip");

    let query = db
      .from("welcome_claims")
      .select("id, user_id, device_identifier, claimed_by, welcome_package, video_url, status, claimed_at")
      .order("claimed_at", { ascending: false })
      .limit(100);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: { user_id: string }) => r.user_id);
    const profiles = ids.length
      ? (
          await supabaseAdmin
            .from("profiles")
            .select("id, public_id, display_name, avatar_url, vip_level, vip_expires_at")
            .in("id", ids)
        ).data ?? []
      : [];

    const search = (data.search ?? "").trim();
    const list = (rows ?? []).map((r: { user_id: string }) => ({
      ...r,
      profile: profiles.find((p: { id: string }) => p.id === r.user_id) ?? null,
    }));
    if (!search) return { claims: list };
    return {
      claims: list.filter(
        (c: { profile: { public_id?: string; display_name?: string } | null }) =>
          c.profile?.public_id?.includes(search) || c.profile?.display_name?.includes(search),
      ),
    };
  });

export const lookupWelcomeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ publicId: z.string().min(3).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertWelcomeManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, public_id, display_name, avatar_url, vip_level, created_at")
      .eq("public_id", data.publicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("لا يوجد مستخدم بهذا المعرّف");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data: claim } = await db
      .from("welcome_claims")
      .select("id, claimed_at, status")
      .eq("user_id", profile.id)
      .maybeSingle();
    return { profile, alreadyClaimed: Boolean(claim), claim: claim ?? null };
  });

export const sendWelcomePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        deviceIdentifier: z.string().max(200).optional(),
        videoUrl: z.string().url().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWelcomeManager(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: existing } = await db
      .from("welcome_claims")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing) throw new Error("هذا المستخدم استلم الترحيبية بالفعل");

    if (data.deviceIdentifier) {
      const { data: sameDevice } = await db
        .from("welcome_claims")
        .select("id")
        .eq("device_identifier", data.deviceIdentifier)
        .limit(1);
      if ((sameDevice ?? []).length > 0) throw new Error("تم استلام الترحيبية من هذا الجهاز مسبقًا");
    }

    const { data: wallet } = await supabaseAdmin
      .from("coin_wallets")
      .select("coins")
      .eq("user_id", data.userId)
      .maybeSingle();
    const before = wallet?.coins ?? 0;
    const after = before + WELCOME_COINS;

    if (wallet) {
      const { error } = await supabaseAdmin.from("coin_wallets").update({ coins: after }).eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("coin_wallets").insert({ user_id: data.userId, coins: after });
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("coin_transactions").insert({
      user_id: data.userId,
      kind: "welcome",
      amount: WELCOME_COINS,
      balance_before: before,
      balance_after: after,
      reference: "welcome_package",
    });

    const expires = new Date(Date.now() + WELCOME_VIP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("vip_level, public_id")
      .eq("id", data.userId)
      .maybeSingle();
    await db
      .from("profiles")
      .update({
        vip_level: Math.max(profile?.vip_level ?? 0, WELCOME_VIP_LEVEL),
        vip_expires_at: expires,
      })
      .eq("id", data.userId);

    const pkg = {
      coins: WELCOME_COINS,
      vip_level: WELCOME_VIP_LEVEL,
      vip_days: WELCOME_VIP_DAYS,
      six_digit_id: (profile?.public_id ?? "").length === 6,
    };

    const { error: claimError } = await db.from("welcome_claims").insert({
      user_id: data.userId,
      device_identifier: data.deviceIdentifier ?? null,
      claimed_by: context.userId,
      welcome_package: pkg,
      video_url: data.videoUrl ?? null,
      status: "delivered",
    });
    if (claimError) throw new Error(claimError.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      kind: "welcome",
      title: "هدية الترحيب 🎁",
      body: `تم إضافة ${WELCOME_COINS.toLocaleString("en-US")} كوينز و VIP ${WELCOME_VIP_LEVEL} لمدة ${WELCOME_VIP_DAYS} أيام إلى حسابك`,
      metadata: { ...pkg, video_url: data.videoUrl ?? null },
    });

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      target_id: data.userId,
      action: "send_welcome_package",
      old_value: String(before),
      new_value: String(after),
    });

    return { balance: after, vipExpiresAt: expires };
  });
