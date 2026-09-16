import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* طلب شراء كوينز بالتحويل المحلي (فودافون كاش / InstaPay) */
export const createCoinPurchaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        packageId: z.string().uuid(),
        method: z.enum(["vodafone_cash", "instapay"]),
        senderReference: z.string().trim().min(4).max(120),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from("coin_packages")
      .select("id, coins, bonus_coins, price_cents, currency, is_active")
      .eq("id", data.packageId)
      .maybeSingle();
    if (pkgError) throw new Error(pkgError.message);
    if (!pkg || !pkg.is_active) throw new Error("الباقة غير متوفرة");

    const { count, error: countError } = await supabaseAdmin
      .from("coin_purchase_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= 3) throw new Error("لديك طلبات قيد المراجعة — انتظر تأكيدها أولًا");

    const payload = {
      user_id: context.userId,
      package_id: pkg.id,
      coins: Number(pkg.coins) + Number(pkg.bonus_coins ?? 0),
      amount_cents: pkg.price_cents,
      currency: pkg.currency,
      method: data.method,
      sender_reference: data.senderReference,
      note: data.note ?? null,
      status: "pending",
    };

    const { data: row, error } = await supabaseAdmin
      .from("coin_purchase_requests")
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
