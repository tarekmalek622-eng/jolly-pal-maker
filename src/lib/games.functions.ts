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

async function settle(
  userId: string,
  bet: number,
  payout: number,
  label: string,
  game: string,
  result: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("settle_game", {
    _user_id: userId,
    _bet: bet,
    _payout: payout,
    _label: label,
  });
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("game_sessions").insert({
    user_id: userId,
    game,
    bet,
    payout,
    status: "settled",
    result: result as never,
  });
}

async function assertGameEnabled(game: "dice" | "wheel" | "cards" | "quiz" | "challenge", bet: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("key, value").in("key", ["games", "limits"]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value as Record<string, unknown>]));
  const games = (map.get("games") ?? {}) as Record<string, boolean | undefined>;
  const key = game === "challenge" ? "quiz" : game;
  if (games[key] === false) throw new Error("هذه اللعبة موقوفة حاليًا");
  const limits = (map.get("limits") ?? {}) as { min_bet?: number; max_bet?: number };
  const min = limits.min_bet ?? 10;
  const max = limits.max_bet ?? 100000;
  if (bet < min || bet > max) {
    throw new Error(`الرهان يجب أن يكون بين ${min} و ${max} كوينز`);
  }
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
    await assertGameEnabled("dice", data.bet);
    await settle(context.userId, data.bet, payout, `dice:${roll}`, "dice", { roll, guess: data.guess, won });
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
    await assertGameEnabled("wheel", data.bet);
    await settle(context.userId, data.bet, payout, `wheel:${chosen.label}`, "wheel", {
      label: chosen.label,
      multiplier: chosen.multiplier,
    });
    return { label: chosen.label, payout };
  });

/* ---------------- لعبة الورق (أعلى بطاقة) ---------------- */

const CARD_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];

function drawCard() {
  const rank = Math.floor(Math.random() * CARD_NAMES.length);
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)]!;
  return { rank, label: `${CARD_NAMES[rank]}${suit}` };
}

export const playCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => betSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGameEnabled("cards", data.bet);
    const player = drawCard();
    const dealer = drawCard();
    const outcome = player.rank > dealer.rank ? "win" : player.rank === dealer.rank ? "draw" : "lose";
    const payout = outcome === "win" ? data.bet * 2 : outcome === "draw" ? data.bet : 0;
    await settle(context.userId, data.bet, payout, `cards:${outcome}`, "cards", {
      player: player.label,
      dealer: dealer.label,
      outcome,
    });
    return { player: player.label, dealer: dealer.label, outcome, payout };
  });

/* ---------------- الأسئلة ---------------- */

export const startQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => betSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertGameEnabled("quiz", data.bet);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: questions, error } = await supabaseAdmin
      .from("quiz_questions")
      .select("id, question, choices, correct_index")
      .eq("is_active", true)
      .limit(200);
    if (error) throw new Error(error.message);
    const pool = questions ?? [];
    if (pool.length === 0) throw new Error("لا توجد أسئلة متاحة");
    const q = pool[Math.floor(Math.random() * pool.length)]!;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("game_sessions")
      .insert({
        user_id: context.userId,
        game: "quiz",
        bet: data.bet,
        payout: 0,
        status: "pending",
        result: { question_id: q.id, correct_index: q.correct_index } as never,
      })
      .select("id")
      .single();
    if (sessionError) throw new Error(sessionError.message);

    return {
      sessionId: session.id,
      question: q.question,
      choices: (q.choices as string[]) ?? [],
    };
  });

export const answerQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().uuid(), choice: z.number().int().min(0).max(3) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session, error } = await supabaseAdmin
      .from("game_sessions")
      .select("id, user_id, bet, status, result")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session || session.user_id !== context.userId) throw new Error("جلسة غير صالحة");
    if (session.status !== "pending") throw new Error("تم إنهاء هذه الجلسة");

    const info = (session.result ?? {}) as { correct_index?: number };
    const correctIndex = info.correct_index ?? -1;
    const correct = data.choice === correctIndex;
    const payout = correct ? Math.floor(session.bet * 3) : 0;

    const { error: settleError } = await supabaseAdmin.rpc("settle_game", {
      _user_id: context.userId,
      _bet: session.bet,
      _payout: payout,
      _label: `quiz:${correct ? "correct" : "wrong"}`,
    });
    if (settleError) throw new Error(settleError.message);

    await supabaseAdmin
      .from("game_sessions")
      .update({
        status: "settled",
        payout,
        result: { ...info, choice: data.choice, correct } as never,
      })
      .eq("id", session.id);

    return { correct, correctIndex, payout };
  });

/* ---------------- التحديات ---------------- */

const CHALLENGES = [
  { key: "reflex", label: "تحدي سرعة البديهة", odds: 0.42, multiplier: 2 },
  { key: "memory", label: "تحدي الذاكرة", odds: 0.3, multiplier: 3 },
  { key: "luck", label: "تحدي الحظ الكبير", odds: 0.12, multiplier: 7 },
] as const;

export const playChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    betSchema.extend({ challenge: z.enum(["reflex", "memory", "luck"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertGameEnabled("challenge", data.bet);
    const config = CHALLENGES.find((c) => c.key === data.challenge)!;
    const won = Math.random() < config.odds;
    const payout = won ? data.bet * config.multiplier : 0;
    await settle(context.userId, data.bet, payout, `challenge:${config.key}`, "challenge", {
      challenge: config.key,
      won,
    });
    return { label: config.label, won, payout, multiplier: config.multiplier };
  });

/* ---------------- الدومينو الجماعي ---------------- */

export interface DominoLogEntry {
  at: string;
  seat?: "p1" | "p2";
  action: "create" | "start" | "move" | "draw" | "pass" | "win" | "blocked_win" | "forfeit" | "draw_end";
  tile?: [number, number];
  side?: "left" | "right";
  count?: number;
  points?: number;
  prize?: number;
  remaining?: number;
  p1?: number;
  p2?: number;
}

export interface DominoState {
  hands: { p1: number[]; p2: number[] };
  board: [number, number][];
  left: number;
  right: number;
  boneyard: number[];
  turn: "p1" | "p2";
  passes: number;
  scores?: { p1: number; p2: number };
  log?: DominoLogEntry[];
}

async function rpcAdmin<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as {
    rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function assertDominoEnabled() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("key, value").eq("key", "games").maybeSingle();
  const games = ((data?.value ?? {}) as Record<string, boolean | undefined>);
  if (games['domino'] === false) throw new Error("الدومينو موقوف حاليًا");
}

export const dominoJoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bet: z.number().int().min(10).max(100000), roomId: z.string().uuid().nullish() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertDominoEnabled();
    const gameId = await rpcAdmin<string>("domino_join", {
      _uid: context.userId,
      _bet: data.bet,
      _room_id: data.roomId ?? null,
    });
    return { gameId: gameId as string };
  });

export const dominoMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ gameId: z.string().uuid(), tile: z.number().int().min(0).max(54), side: z.enum(["left", "right"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const state = await rpcAdmin<DominoState>("domino_move", {
      _uid: context.userId,
      _game_id: data.gameId,
      _tile: data.tile,
      _side: data.side,
    });
    return { state: state as DominoState };
  });

export const dominoPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const state = await rpcAdmin<DominoState>("domino_pass", { _uid: context.userId, _game_id: data.gameId });
    return { state };
  });

export const dominoForfeit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const state = await rpcAdmin<DominoState>("domino_forfeit", { _uid: context.userId, _game_id: data.gameId });
    return { state: state as DominoState };
  });

export const dominoCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gameId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await rpcAdmin("domino_cancel", { _uid: context.userId, _game_id: data.gameId });
    return { ok: true };
  });
