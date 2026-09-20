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
      .select("id, title, body, image_url, kind, created_at")
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
        kind: z.enum(["announcement", "event_result", "event_start", "maintenance", "update"]).default("announcement"),
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
      .select("id, title, body, image_url, kind, created_at")
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
