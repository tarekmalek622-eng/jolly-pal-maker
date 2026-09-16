import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Loader2, LogOut, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/AppShell";
import { useSupabaseSession, useRefreshMoney } from "@/hooks/use-session";
import { dominoCancel, dominoForfeit, dominoJoin, dominoMove, dominoPass } from "@/lib/games.functions";
import type { DominoState } from "@/lib/games.functions";
import { cn } from "@/lib/utils";

interface DominoRow {
  id: string;
  status: "waiting" | "playing" | "finished" | "cancelled";
  bet: number;
  room_id: string | null;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  state: DominoState;
  created_at: string;
  updated_at: string;
}

interface LobbyRow {
  id: string;
  bet: number;
  player1_id: string;
  created_at: string;
}

interface ProfileLite {
  id: string;
  display_name: string | null;
  public_id: string;
}

/* الوصول لجدول domino_games عبر عميل مُوسع (غير مضمّن في الأنواع المولدة بعد) */
function db() {
  return (supabase as unknown as { from: (t: string) => ReturnType<typeof rawFrom> }).from("domino_games");
}
function rawFrom() {
  return null as never;
}

const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Half({ n }: { n: number }) {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 p-[3px]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={cn("m-auto block h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5", PIPS[n]?.includes(i) ? "bg-foreground" : "bg-transparent")}
        />
      ))}
    </div>
  );
}

function TileFace({ a, b, className, onClick, disabled }: { a: number; b: number; className?: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-transform",
        onClick && !disabled && "active:scale-95",
        disabled && "opacity-60",
        className,
      )}
    >
      <span className="h-8 w-8 bg-surface-2 sm:h-10 sm:w-10">
        <Half n={a} />
      </span>
      <span className="h-8 w-8 border-s border-border bg-surface-2 sm:h-10 sm:w-10">
        <Half n={b} />
      </span>
    </button>
  );
}

const BETS = [50, 100, 500, 1000, 5000];

export function DominoGame({ roomId }: { roomId?: string | null }) {
  const { userId } = useSupabaseSession();
  const refresh = useRefreshMoney();
  const queryClient = useQueryClient();
  const [bet, setBet] = useState(100);
  const [gameId, setGameId] = useState<string | null>(null);
  const [pendingTile, setPendingTile] = useState<number | null>(null);
  const joinedRef = useRef(false);

  /* الطاولات المنتظرة */
  const lobby = useQuery({
    queryKey: ["domino-lobby", roomId ?? null, userId],
    enabled: !gameId && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db()
        .select("id, bet, player1_id, created_at, room_id")
        .eq("status", "waiting")
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw error;
      let rows = (data ?? []) as (LobbyRow & { room_id: string | null })[];
      if (roomId) rows = rows.filter((r) => r.room_id === roomId);
      const ids = Array.from(new Set(rows.map((r) => r.player1_id)));
      let owners: ProfileLite[] = [];
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, public_id")
          .in("id", ids);
        owners = (profs ?? []) as ProfileLite[];
      }
      return { rows, owners };
    },
  });

  /* مباراتي */
  const game = useQuery({
    queryKey: ["domino-game", gameId],
    enabled: Boolean(gameId),
    queryFn: async () => {
      const { data, error } = await db().select("*").eq("id", gameId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as DominoRow | null;
    },
  });

  /* تحديث فوري عبر Realtime */
  useEffect(() => {
    if (!gameId) return;
    const channel = (supabase.channel(`domino-${gameId}`) as unknown as {
      on: (type: string, opts: unknown, cb: (payload: { new: DominoRow | null }) => void) => unknown;
      subscribe: () => { unsubscribe: () => void };
    })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "domino_games", filter: `id=eq.${gameId}` },
        (payload) => {
          if (payload.new) {
            queryClient.setQueryData(["domino-game", gameId], payload.new);
          }
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [gameId, queryClient]);

  /* تحديث قائمة الانتظار عبر Realtime + احتياطي دوري */
  useEffect(() => {
    if (gameId) return;
    const channel = (supabase.channel("domino-lobby") as unknown as {
      on: (type: string, opts: unknown, cb: () => void) => unknown;
      subscribe: () => { unsubscribe: () => void };
    })
      .on("postgres_changes", { event: "*", schema: "public", table: "domino_games" }, () => {
        void lobby.refetch();
      })
      .subscribe();
    const t = setInterval(() => void lobby.refetch(), 10000);
    return () => {
      void channel.unsubscribe();
      clearInterval(t);
    };
  }, [gameId, lobby]);

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "حدث خطأ");

  const join = useMutation({
    mutationFn: async (input: { bet: number }) => dominoJoin({ data: { bet: input.bet, roomId: roomId ?? null } }),
    onSuccess: (r) => {
      joinedRef.current = true;
      setGameId(r.gameId);
      void queryClient.invalidateQueries({ queryKey: ["domino-lobby"] });
    },
    onError: fail,
  });

  const move = useMutation({
    mutationFn: async (input: { tile: number; side: "left" | "right" }) =>
      dominoMove({ data: { gameId: gameId!, tile: input.tile, side: input.side } }),
    onSuccess: (r) => {
      setPendingTile(null);
      queryClient.setQueryData(["domino-game", gameId], (old: DominoRow | null) =>
        old ? { ...old, state: r.state } : old,
      );
      if (r.state && "turn" in r.state) refresh();
    },
    onError: fail,
  });

  const pass = useMutation({
    mutationFn: async () => dominoPass({ data: { gameId: gameId! } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["domino-game", gameId], (old: DominoRow | null) =>
        old ? { ...old, state: r.state } : old,
      );
      refresh();
    },
    onError: fail,
  });

  const forfeit = useMutation({
    mutationFn: async () => {
      if (!window.confirm("هل تريد الانسحاب؟ يفوز خصمك بالجولة.")) throw new Error("تم الإلغاء");
      return dominoForfeit({ data: { gameId: gameId! } });
    },
    onSuccess: () => refresh(),
    onError: (e) => {
      if (e instanceof Error && e.message !== "تم الإلغاء") fail(e);
    },
  });

  const cancel = useMutation({
    mutationFn: async () => dominoCancel({ data: { gameId: gameId! } }),
    onSuccess: () => {
      toast.success("أُلغيت الطاولة واستُرد رهانك");
      setGameId(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["domino-lobby"] });
    },
    onError: fail,
  });

  const row = game.data;
  const seat = row && userId ? (row.player1_id === userId ? "p1" : row.player2_id === userId ? "p2" : null) : null;
  const st = row?.state;
  const myTurn = row?.status === "playing" && seat != null && st?.turn === seat;
  const oppSeat = seat === "p1" ? "p2" : "p1";
  const myHand = (seat && st?.hands?.[seat]) ?? [];
  const oppCount = (st?.hands?.[oppSeat] as number[] | undefined)?.length ?? 7;
  const boneCount = st?.boneyard?.length ?? 0;
  const left = st?.left ?? -1;
  const right = st?.right ?? -1;

  const playableSides = useCallback(
    (tile: number): ("left" | "right")[] => {
      if (!myTurn) return [];
      const a = Math.floor(tile / 8);
      const b = tile % 8;
      if (left === -1) return ["left"];
      const sides: ("left" | "right")[] = [];
      if (a === left || b === left) sides.push("left");
      if (a === right || b === right) sides.push("right");
      return sides;
    },
    [myTurn, left, right],
  );

  const anyPlayable = myHand.some((t) => playableSides(t).length > 0);

  /* شاشة الطاولة */
  if (gameId) {
    return (
      <div className="space-y-4">
        {!row || game.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !seat ? (
          <EmptyState title="لست لاعبًا في هذه المباراة" />
        ) : (
          <>
            <div className="surface-card flex items-center justify-between p-3">
              <div className="text-xs">
                <p className="font-bold">الرهان: {row.bet.toLocaleString("en-US")} كوينز</p>
                <p className="text-muted-foreground">الخصم: {oppCount} قطعة · البقرة: {boneCount}</p>
              </div>
              {row.status === "waiting" ? (
                <span className="rounded-full bg-surface-2 px-3 py-1 text-[10px] font-bold">بانتظار لاعب…</span>
              ) : row.status === "playing" ? (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-bold",
                    myTurn ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {myTurn ? "دورك الآن" : "دور الخصم"}
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-[10px] font-bold">
                  <Crown className="h-3 w-3 text-primary" />
                  {row.winner_id === null
                    ? "تعادل"
                    : row.winner_id === userId
                      ? "فزت! 🎉"
                      : "خسرت الجولة"}
                </span>
              )}
            </div>

            {row.status === "waiting" ? (
              <Button
                variant="destructive"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="w-full rounded-2xl"
              >
                {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                إلغاء الطاولة واسترداد الرهان
              </Button>
            ) : row.status === "finished" ? (
              <Button onClick={() => setGameId(null)} className="w-full rounded-2xl gradient-gold font-bold text-primary-foreground">
                العودة إلى اللوبي
              </Button>
            ) : (
              <>
                <div dir="ltr" className="surface-card flex min-h-24 items-center gap-1.5 overflow-x-auto p-3">
                  {(st?.board ?? []).length === 0 ? (
                    <p className="mx-auto text-center text-[11px] text-muted-foreground">الطاولة فارغة — ضع أول قطعة</p>
                  ) : (
                    (st?.board ?? []).map(([a, b], i) => <TileFace key={i} a={a} b={b} />)
                  )}
                </div>

                <div className="surface-card p-3">
                  <p className="mb-2 text-xs font-bold">قطعك ({myHand.length})</p>
                  {pendingTile !== null && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-[11px]">
                      <span>اختر الجهة:</span>
                      <Button size="sm" variant="secondary" onClick={() => move.mutate({ tile: pendingTile, side: "left" })} disabled={move.isPending}>
                        يسار
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => move.mutate({ tile: pendingTile, side: "right" })} disabled={move.isPending}>
                        يمين
                      </Button>
                      <button type="button" onClick={() => setPendingTile(null)} className="text-muted-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {myHand.map((t) => {
                      const sides = playableSides(t);
                      return (
                        <TileFace
                          key={t}
                          a={Math.floor(t / 8)}
                          b={t % 8}
                          disabled={!myTurn || sides.length === 0 || move.isPending}
                          onClick={() => {
                            if (sides.length === 1) move.mutate({ tile: t, side: sides[0]! });
                            else setPendingTile(t);
                          }}
                          className={cn(sides.length > 0 && "border-primary shadow-[0_0_8px] shadow-primary/40")}
                        />
                      );
                    })}
                    {myHand.length === 0 && <p className="text-[11px] text-muted-foreground">لا قطع — انتهت</p>}
                  </div>

                  <div className="mt-3 flex gap-2">
                    {myTurn && !anyPlayable && (
                      <Button onClick={() => pass.mutate()} disabled={pass.isPending} className="flex-1 rounded-xl" variant="secondary">
                        {pass.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "سحب / تمرير"}
                      </Button>
                    )}
                    <Button
                      onClick={() => forfeit.mutate()}
                      disabled={forfeit.isPending}
                      variant="destructive"
                      className="flex-1 rounded-xl"
                    >
                      <LogOut className="h-4 w-4" />
                      انسحاب
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  /* اللوبي */
  const others = (lobby.data?.rows ?? []).filter((r) => r.player1_id !== userId);
  const mine = (lobby.data?.rows ?? []).find((r) => r.player1_id === userId);

  return (
    <div className="space-y-4">
      <div className="surface-card p-4">
        <p className="text-sm font-bold">أنشئ طاولة دومينو</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          كل لاعب يدفع الرهان عند الدخول، والفائز يأخذ الوعاء كاملًا (ضعف الرهان). اسحب من البقرة عند الحاجة.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BETS.map((n) => (
            <button
              key={n}
              onClick={() => setBet(n)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs",
                bet === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {n.toLocaleString("en-US")}
            </button>
          ))}
        </div>
        <Input
          type="number"
          value={bet}
          min={10}
          onChange={(e) => setBet(Math.max(10, Number(e.target.value) || 10))}
          className="mt-3 h-11 rounded-2xl bg-surface-2"
        />
        {mine ? (
          <Button
            onClick={() => setGameId(mine.id)}
            className="mt-3 h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
          >
            لديك طاولة منتظرة — عد إليها
          </Button>
        ) : (
          <Button
            onClick={() => join.mutate({ bet })}
            disabled={join.isPending}
            className="mt-3 h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
          >
            {join.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "إنشاء طاولة ودخول"}
          </Button>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">طاولات بانتظار لاعب</p>
        {lobby.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : others.length === 0 ? (
          <EmptyState title="لا طاولات منتظرة — أنشئ واحدة وانتظر الخصوم" />
        ) : (
          <div className="space-y-2">
            {others.map((r) => {
              const owner = lobby.data?.owners.find((o) => o.id === r.player1_id);
              return (
                <div key={r.id} className="surface-card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{owner?.display_name ?? "لاعب"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      رهان {r.bet.toLocaleString("en-US")} كوينز · الوعاء {(r.bet * 2).toLocaleString("en-US")}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => join.mutate({ bet: r.bet })} disabled={join.isPending} className="rounded-xl px-4">
                    دخول
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
