import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminSetRoomSystemsSettings, adminSettleRoomRewardWeek } from "@/lib/rooms.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TreasureLevel = {
  level: number;
  name: string;
  target: number;
  prizes: { rank: number; coins: number }[];
};
type Treasure = { enabled: boolean; levels: TreasureLevel[] };
type Tier = {
  revenue: number;
  owner_coins: number;
  admin_coins: number;
  admins_min: number;
  admins_max: number;
  percent: number;
  weekly_cap: number;
};
type Rewards = { min_weekly_cup: number; tiers: Tier[] };

export function AdminRoomSystemsTab() {
  const settings = useQuery({
    queryKey: ["admin-room-systems"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["room_treasure", "room_rewards"]);
      if (error) throw new Error(error.message);
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        treasure: (map.get("room_treasure") ?? {
          enabled: true,
          levels: [],
        }) as unknown as Treasure,
        rewards: (map.get("room_rewards") ?? {
          min_weekly_cup: 200000,
          tiers: [],
        }) as unknown as Rewards,
      };
    },
  });

  const [draft, setDraft] = useState<{ treasure: Treasure; rewards: Rewards } | null>(null);
  const state = draft ?? settings.data ?? null;

  const [roomId, setRoomId] = useState("");
  const [weekStart, setWeekStart] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      await adminSetRoomSystemsSettings({ data: state });
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات أنظمة الغرفة");
      setDraft(null);
      void settings.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const settle = useMutation({
    mutationFn: async () =>
      adminSettleRoomRewardWeek({ data: { roomId: roomId.trim(), weekStart } }),
    onSuccess: () => toast.success("تم توزيع مكافآت الأسبوع"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التوزيع"),
  });

  if (!state)
    return <div className="surface-card p-4 text-xs text-muted-foreground">جارٍ التحميل…</div>;

  const setTreasure = (next: Treasure) => setDraft({ treasure: next, rewards: state.rewards });
  const setRewards = (next: Rewards) => setDraft({ treasure: state.treasure, rewards: next });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-3 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">صندوق كنز الغرفة</p>
          <button
            type="button"
            onClick={() => setTreasure({ ...state.treasure, enabled: !state.treasure.enabled })}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-bold"
          >
            {state.treasure.enabled ? "مفعّل" : "موقوف"}
          </button>
        </div>
        {state.treasure.levels.map((l, i) => (
          <div key={l.level} className="space-y-2 rounded-2xl border border-border/60 p-2">
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">المستوى</span>
                <Input value={l.level} readOnly className="h-9 rounded-xl text-xs" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">الاسم</span>
                <Input
                  value={l.name}
                  onChange={(e) => {
                    const levels = [...state.treasure.levels];
                    levels[i] = { ...l, name: e.target.value };
                    setTreasure({ ...state.treasure, levels });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">الهدف (كوينز)</span>
                <Input
                  type="number"
                  value={l.target}
                  onChange={(e) => {
                    const levels = [...state.treasure.levels];
                    levels[i] = { ...l, target: Number(e.target.value) || 0 };
                    setTreasure({ ...state.treasure, levels });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {l.prizes.map((p, pi) => (
                <label key={p.rank} className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">جائزة المركز {p.rank}</span>
                  <Input
                    type="number"
                    value={p.coins}
                    onChange={(e) => {
                      const levels = [...state.treasure.levels];
                      const prizes = [...l.prizes];
                      prizes[pi] = { ...p, coins: Number(e.target.value) || 0 };
                      levels[i] = { ...l, prizes };
                      setTreasure({ ...state.treasure, levels });
                    }}
                    className="h-9 rounded-xl text-xs"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="surface-card space-y-3 p-3">
        <p className="text-sm font-bold">دعم وجوائز الغرفة</p>
        <label className="block space-y-1">
          <span className="text-[10px] text-muted-foreground">
            حد التسجيل الأسبوعي (كأس الغرفة)
          </span>
          <Input
            type="number"
            value={state.rewards.min_weekly_cup}
            onChange={(e) =>
              setRewards({ ...state.rewards, min_weekly_cup: Number(e.target.value) || 0 })
            }
            className="h-9 rounded-xl text-xs"
          />
        </label>
        {state.rewards.tiers.map((t, i) => (
          <div
            key={t.revenue}
            className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 p-2"
          >
            {(
              [
                ["revenue", "إيراد الأسبوع"],
                ["owner_coins", "مكافأة المالك"],
                ["admin_coins", "إجمالي الادمن"],
                ["admins_min", "أقل عدد ادمن"],
                ["admins_max", "أكثر عدد ادمن"],
                ["percent", "النسبة %"],
                ["weekly_cap", "الحد الأسبوعي"],
              ] as [keyof Tier, string][]
            ).map(([field, label]) => (
              <label key={field} className="space-y-1">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <Input
                  type="number"
                  value={t[field]}
                  onChange={(e) => {
                    const tiers = [...state.rewards.tiers];
                    tiers[i] = { ...t, [field]: Number(e.target.value) || 0 };
                    setRewards({ ...state.rewards, tiers });
                  }}
                  className="h-9 rounded-xl text-xs"
                />
              </label>
            ))}
          </div>
        ))}
      </div>

      <Button
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="h-11 w-full rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
      >
        حفظ الإعدادات
      </Button>

      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">توزيع مكافآت أسبوع لغرفة</p>
        <Input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="معرّف الغرفة (UUID)"
          className="h-9 rounded-xl text-xs"
        />
        <Input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="h-9 rounded-xl text-xs"
        />
        <Button
          disabled={settle.isPending || !roomId || !weekStart}
          onClick={() => settle.mutate()}
          variant="outline"
          className="h-10 w-full rounded-xl text-xs"
        >
          توزيع المكافآت
        </Button>
      </div>
    </div>
  );
}
