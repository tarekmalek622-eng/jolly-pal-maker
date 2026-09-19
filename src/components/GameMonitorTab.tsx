import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCompact, formatFull } from "@/lib/format";
import { adminRecoverRound, adminSettleGameDay, getGameMonitor, type GameRoundRow } from "@/lib/game-admin.functions";

const STATUS_LABEL: Record<string, string> = {
  waiting: "بالانتظار",
  betting: "الرهان مفتوح",
  processing: "قيد المعالجة",
  result_ready: "النتيجة جاهزة",
  settled: "تمت التسوية",
  failed: "فشلت",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3" title={formatFull(value)}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black">{formatCompact(value)}</p>
    </div>
  );
}

function RoundLine({ round, onRecover, busy }: { round: GameRoundRow; onRecover?: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold">
          جولة {round.session_round_no ?? round.round_no} · {STATUS_LABEL[round.status] ?? round.status}
          {round.winning_key ? ` · ${round.winning_key}` : ""}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          رهانات {round.total_bets ?? 0} · {formatCompact(Number(round.total_amount ?? 0))} ↔{" "}
          {formatCompact(Number(round.total_payout ?? 0))}
          {round.last_error ? ` · ${round.last_error}` : ""}
        </p>
      </div>
      {onRecover && (
        <Button size="sm" variant="outline" className="shrink-0" onClick={onRecover} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "استكمال"}
        </Button>
      )}
    </div>
  );
}

export function GameMonitorTab() {
  const qc = useQueryClient();
  const fetchMonitor = useServerFn(getGameMonitor);
  const recover = useServerFn(adminRecoverRound);
  const settleDay = useServerFn(adminSettleGameDay);

  const monitor = useQuery({
    queryKey: ["game-monitor"],
    queryFn: () => fetchMonitor({ data: undefined as never }),
    refetchInterval: 8000,
  });

  const recoverMutation = useMutation({
    mutationFn: (roundId: string) => recover({ data: { roundId } }),
    onSuccess: () => {
      toast.success("تم استكمال الجولة");
      void qc.invalidateQueries({ queryKey: ["game-monitor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settleMutation = useMutation({
    mutationFn: (sessionId: string) => settleDay({ data: { sessionId } }),
    onSuccess: (res) => {
      toast.success(`تمت تسوية اليوم · ${res.rewarded} مكافأة`);
      void qc.invalidateQueries({ queryKey: ["game-monitor"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (monitor.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (monitor.error) {
    return <p className="py-8 text-center text-xs text-destructive">{(monitor.error as Error).message}</p>;
  }

  const data = monitor.data!;
  const s = data.session;

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border border-primary/35 bg-primary/10 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black">جلسة اليوم {s?.session_date ?? "—"}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {s ? `${s.total_rounds} / ${s.max_rounds} جولة · ${s.status}` : "لا توجد جلسة"}
              {s?.settled_at ? " · تمت تسوية اليوم" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void monitor.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {s && (
              <Button
                size="sm"
                onClick={() => settleMutation.mutate(s.id)}
                disabled={settleMutation.isPending || Boolean(s.settled_at)}
              >
                {settleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                تسوية اليوم
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black">الجولة الحالية</p>
        {data.current ? (
          <RoundLine
            round={data.current}
            onRecover={
              data.current.status === "processing" || data.current.status === "failed"
                ? () => recoverMutation.mutate(data.current!.id)
                : undefined
            }
            busy={recoverMutation.isPending}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">لا توجد جولة مفتوحة</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-black">إحصائيات آخر {data.stats.rounds} جولة</p>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="إجمالي الرهانات" value={data.stats.amount} />
          <Stat label="إجمالي الجوائز" value={data.stats.payout} />
          <Stat label="صافي اللعبة" value={data.stats.net} />
          <Stat label="عدد الرهانات" value={data.stats.bets} />
          <Stat label="رهانات رابحة" value={data.stats.winners} />
          <Stat label="رهانات خاسرة" value={data.stats.losers} />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          متوسط زمن التسوية: {data.stats.avg_settle_ms} مللي ثانية
        </p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black">
          <Trophy className="h-3.5 w-3.5 text-primary" /> أفضل 10 اليوم (الصافي)
        </p>
        <div className="space-y-2">
          {data.top.length === 0 && <p className="text-[11px] text-muted-foreground">لا نتائج اليوم</p>}
          {data.top.map((t, i) => (
            <div key={t.user_id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="w-5 text-center text-xs font-black text-primary">{i + 1}</span>
              <UserAvatar url={t.avatar_url} name={t.display_name ?? ""} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{t.display_name ?? "مستخدم"}</p>
                <p className="text-[10px] text-muted-foreground">ID {t.public_id ?? "—"}</p>
              </div>
              <div className="text-end" title={formatFull(t.net_result)}>
                <p className={t.net_result >= 0 ? "text-xs font-black text-primary" : "text-xs font-black text-destructive"}>
                  {t.net_result >= 0 ? "+" : "-"}
                  {formatCompact(Math.abs(t.net_result))}
                </p>
                <p className="text-[10px] text-muted-foreground">ربح {formatCompact(t.gross_win)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black">معاملات فاشلة / جولات متعطلة</p>
        <div className="space-y-2">
          {data.failed.length === 0 && <p className="text-[11px] text-muted-foreground">لا مشاكل مسجّلة</p>}
          {data.failed.map((r) => (
            <RoundLine key={r.id} round={r} onRecover={() => recoverMutation.mutate(r.id)} busy={recoverMutation.isPending} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black">سجل الاستعادة والتسوية</p>
        <div className="space-y-2">
          {data.recovery.length === 0 && <p className="text-[11px] text-muted-foreground">لا سجلات</p>}
          {data.recovery.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface px-3 py-2">
              <p className="text-[11px] font-bold">{r.action}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString("ar")} · {r.new_value ?? ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-black">آخر الجولات</p>
        <div className="space-y-2">
          {data.recent.map((r) => (
            <RoundLine key={r.id} round={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
