import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CrownWinner = {
  rank: number;
  coins: number;
  score?: number;
  name: string;
  public_id?: string | null;
  avatar_url?: string | null;
};

export type CrownMeta = {
  event?: string;
  event_id?: string;
  starts_at?: string;
  ends_at?: string;
  top_prize?: number | null;
  winners?: CrownWinner[];
};

export type CrownMessage = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  kind: string;
  created_at: string;
  event_id?: string | null;
  metadata?: CrownMeta | null;
};

/** رسائل التاج — رسائل رسمية من التطبيق لكل المستخدمين. */
export const listCrownMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("crown_messages")
      .select("id, title, body, image_url, kind, created_at, event_id, metadata")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as CrownMessage[];
  });

/** نشر رسالة تاج رسمية (للإدارة فقط). */
export const publishCrownMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().min(2).max(4000),
        imageUrl: z.string().trim().max(500).nullish(),
        kind: z
          .enum(["announcement", "event_result", "event_start", "maintenance", "update"])
          .default("announcement"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("هذه العملية للإدارة فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin as any)
      .from("crown_messages")
      .insert({
        title: data.title,
        body: data.body,
        image_url: data.imageUrl ?? null,
        kind: data.kind,
        created_by: context.userId,
      })
      .select("id, title, body, image_url, kind, created_at, event_id, metadata")
      .single();
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("audit_logs").insert({
      actor_id: context.userId,
      action: "crown_message_publish",
      target_id: row.id,
      new_value: { title: data.title, kind: data.kind },
    });
    return row as CrownMessage;
  });

/** عدد رسائل التاج الجديدة التي لم يفتحها المستخدم بعد. */
export const getCrownUnread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: read } = await sb
      .from("crown_reads")
      .select("last_seen_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    const since = read?.last_seen_at ?? "1970-01-01T00:00:00Z";
    const { count, error } = await sb
      .from("crown_messages")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("created_at", since);
    if (error) throw new Error(error.message);
    return { unread: count ?? 0 };
  });

/** تسجيل فتح رسائل التاج — يُخفي نقطة الإشعار ولا يتكرر. */
export const markCrownRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any)
      .from("crown_reads")
      .upsert(
        { user_id: context.userId, last_seen_at: now, updated_at: now },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
