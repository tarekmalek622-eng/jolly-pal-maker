import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function assertAdmin(supabase: Rpc, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error || data !== true) throw new Error("إدارة العائلات للإدارة فقط");
}

async function log(actorId: string, targetId: string, action: string, oldValue: unknown, newValue: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    target_id: targetId,
    action,
    old_value: oldValue as never,
    new_value: newValue as never,
  });
}

const FAMILY_ROLES = ["leader", "deputy", "member"] as const;

export const adminCreateFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(40),
        familyCode: z
          .string()
          .trim()
          .regex(/^\d{4,10}$/)
          .optional(),
        logoUrl: z.string().trim().max(500).optional(),
        description: z.string().trim().max(300).optional(),
        leaderId: z.string().uuid(),
        maxMembers: z.number().int().min(5).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let code = data.familyCode;
    if (!code) {
      const { data: gen, error: genError } = await supabaseAdmin.rpc("gen_family_code");
      if (genError) throw new Error(genError.message);
      code = gen as unknown as string;
    }

    const { data: existingMember } = await supabaseAdmin
      .from("family_members")
      .select("family_id")
      .eq("user_id", data.leaderId)
      .maybeSingle();
    if (existingMember) throw new Error("القائد المختار عضو في عائلة أخرى بالفعل");

    const { data: family, error } = await supabaseAdmin
      .from("families")
      .insert({
        family_code: code,
        name: data.name,
        logo_url: data.logoUrl ?? null,
        description: data.description ?? null,
        leader_id: data.leaderId,
        max_members: data.maxMembers ?? 50,
        created_by: context.userId,
      })
      .select("id, family_code, name")
      .single();
    if (error) throw new Error(error.message);

    const { error: memberError } = await supabaseAdmin
      .from("family_members")
      .insert({ family_id: family.id, user_id: data.leaderId, role: "leader" });
    if (memberError) throw new Error(memberError.message);

    await log(context.userId, family.id, "family_create", null, { name: family.name, code: family.family_code });
    return family;
  });

export const adminUpdateFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        familyId: z.string().uuid(),
        name: z.string().trim().min(2).max(40).optional(),
        familyCode: z
          .string()
          .trim()
          .regex(/^\d{4,10}$/)
          .optional(),
        logoUrl: z.string().trim().max(500).nullable().optional(),
        description: z.string().trim().max(300).nullable().optional(),
        leaderId: z.string().uuid().optional(),
        level: z.number().int().min(1).max(20).optional(),
        points: z.number().int().min(0).optional(),
        maxMembers: z.number().int().min(5).max(500).optional(),
        isActive: z.boolean().optional(),
        isSuspended: z.boolean().optional(),
        permissions: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("families")
      .select("*")
      .eq("id", data.familyId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new Error("العائلة غير موجودة");

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.familyCode !== undefined) patch["family_code"] = data.familyCode;
    if (data.logoUrl !== undefined) patch["logo_url"] = data.logoUrl;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.level !== undefined) patch["level"] = data.level;
    if (data.points !== undefined) patch["points"] = data.points;
    if (data.maxMembers !== undefined) patch["max_members"] = data.maxMembers;
    if (data.isActive !== undefined) patch["is_active"] = data.isActive;
    if (data.isSuspended !== undefined) patch["is_suspended"] = data.isSuspended;
    if (data.permissions !== undefined) patch["permissions"] = data.permissions;

    if (data.leaderId !== undefined && data.leaderId !== before.leader_id) {
      const { data: other } = await supabaseAdmin
        .from("family_members")
        .select("family_id")
        .eq("user_id", data.leaderId)
        .maybeSingle();
      if (other && other.family_id !== data.familyId) throw new Error("القائد الجديد عضو في عائلة أخرى");
      patch["leader_id"] = data.leaderId;

      if (before.leader_id) {
        await supabaseAdmin
          .from("family_members")
          .update({ role: "deputy" })
          .eq("family_id", data.familyId)
          .eq("user_id", before.leader_id);
      }
      await supabaseAdmin
        .from("family_members")
        .upsert({ family_id: data.familyId, user_id: data.leaderId, role: "leader" }, { onConflict: "user_id" });
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("families").update(patch).eq("id", data.familyId);
      if (error) throw new Error(error.message);
    }

    await log(context.userId, data.familyId, "family_update", { name: before.name }, patch);
    return { ok: true };
  });

export const adminDeleteFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ familyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("families").delete().eq("id", data.familyId);
    if (error) throw new Error(error.message);
    await log(context.userId, data.familyId, "family_delete", null, null);
    return { ok: true };
  });

export const adminSetFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        familyId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(FAMILY_ROLES).optional(),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.remove) {
      const { error } = await supabaseAdmin
        .from("family_members")
        .delete()
        .eq("family_id", data.familyId)
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("families").update({ leader_id: null }).eq("id", data.familyId).eq("leader_id", data.userId);
      await log(context.userId, data.userId, "family_member_remove", data.familyId, null);
      return { ok: true };
    }

    const { data: family, error: familyError } = await supabaseAdmin
      .from("families")
      .select("id, max_members, member_count, is_suspended")
      .eq("id", data.familyId)
      .maybeSingle();
    if (familyError) throw new Error(familyError.message);
    if (!family) throw new Error("العائلة غير موجودة");
    if (family.is_suspended) throw new Error("العائلة موقوفة");

    const { data: current } = await supabaseAdmin
      .from("family_members")
      .select("family_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (current && current.family_id !== data.familyId) throw new Error("المستخدم عضو في عائلة أخرى");
    if (!current && family.member_count >= family.max_members) throw new Error("العائلة وصلت للحد الأقصى للأعضاء");

    const role = data.role ?? "member";
    if (role === "deputy") {
      const settings = await supabaseAdmin.rpc("family_settings");
      const maxDeputies = Number((settings.data as { max_deputies?: number } | null)?.max_deputies ?? 4);
      const { count } = await supabaseAdmin
        .from("family_members")
        .select("id", { count: "exact", head: true })
        .eq("family_id", data.familyId)
        .eq("role", "deputy")
        .neq("user_id", data.userId);
      if ((count ?? 0) >= maxDeputies) throw new Error(`الحد الأقصى لعدد النواب ${maxDeputies}`);
    }

    const { error } = await supabaseAdmin
      .from("family_members")
      .upsert({ family_id: data.familyId, user_id: data.userId, role }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    if (role === "leader") {
      await supabaseAdmin.from("families").update({ leader_id: data.userId }).eq("id", data.familyId);
    }

    await log(context.userId, data.userId, "family_member_set", data.familyId, { role });
    return { ok: true };
  });

export const adminSetFamilySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        max_deputies: z.number().int().min(0).max(20),
        default_max_members: z.number().int().min(5).max(500),
        levels: z
          .array(
            z.object({
              level: z.number().int().min(1).max(20),
              name: z.string().trim().min(1).max(40),
              points: z.number().int().min(0),
              max_members: z.number().int().min(5).max(500),
              style: z.string().trim().min(1).max(30),
            }),
          )
          .min(1)
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "families", value: data as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await log(context.userId, "families", "family_settings_update", null, data);
    return { ok: true };
  });
