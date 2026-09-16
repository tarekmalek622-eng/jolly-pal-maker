import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const betSchema = z.object({ bet: z.number().int().min(10).max(100000) });

const WHEEL: { label: string; multiplier: number; weight: number }[] = [
  { label: "لا شيء", multiplier: 0, weight: 34 },
  { label: "×0.5", multiplier: 0.5, weight: 20 },
  { label: "×1", multiplier: 1, weight: 20 },
  { label: "×2", multiplier: 2, weight: 15 },
  { label: "×3", multiplier: 3, weight: 8 },
  { label: "×5", multiplier: 5, weight: 2.5 },
  { label: "×10", multiplier: 10, weight: 0.5 },
];

async function settle(userId: string, bet: number, payout: number, label: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("settle_game", {
    _user_id: userId,
    _bet: bet,
    _payout: payout,
    _label: label,
  });
  if (error) throw new Error(error.message);
}

export const playDice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    betSchema.extend({ guess: z.number().int().min(1).max(6) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const roll = 1 + Math.floor(Math.random() * 6);
    const won = roll === data.guess;
    const payout = won ? data.bet * 5 : 0;
    await settle(context.userId, data.bet, payout, `dice:${roll}`);
    return { roll, won, payout };
  });

export const spinWheel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => betSchema.parse(input))
  .handler(async ({ data, context }) => {
    const total = WHEEL.reduce((sum, slot) => sum + slot.weight, 0);
    let ticket = Math.random() * total;
    let chosen = WHEEL[0]!;
    for (const slot of WHEEL) {
      ticket -= slot.weight;
      if (ticket <= 0) {
        chosen = slot;
        break;
      }
    }
    const payout = Math.floor(data.bet * chosen.multiplier);
    await settle(context.userId, data.bet, payout, `wheel:${chosen.label}`);
    return { label: chosen.label, payout };
  });
