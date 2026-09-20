import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, Gift, Loader2, Sparkles, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

type TabKey = "info" | "members" | "activities" | "treasure" | "rewards";

const TABS: { key: TabKey; label: string }[] = [
  { key: "info", label: "المعلومات" },
  { key: "members", label: "الأعضاء" },
  { key: "activities", label: "النشاطات" },
  { key: "treasure", label: "صندوق الكنز" },
  { key: "rewards", label: "جوائز الغرفة" },
];

const ACTIVITY_KINDS: { key: string; label: string }[] = [
  { key: "chat", label: "💬 الدردشة" },
  { key: "seven77", label: "🎰 Lucky777" },
  { key: "wheel", label: "🎡 عجلة الحظ" },
  { key: "supercar", label: "🏎️ سباق السيارات" },
  { key: "domino", label: "🁫 دومينو" },
];

type TreasureState = {
  level: number;
  progress: number;
  total_opened: number;
  current: { level?: number; name?: string; target?: number; prizes?: { rank: number; coins: number }[] };
  levels: { level: number; name: string; target: number; prizes: { rank: number; coins: number }[] }[];
  contributors: { user_id: string; display_name: string | null; avatar_url: string | null; amount: number }[];
  recent_opens: { level: number; total_prize: number; created_at: string }[];
};

type RewardsState = {
  week_start: string;
  weekly_revenue: number;
  last_week_revenue: number;
  tier: { revenue?: number; owner_coins?: number; admin_coins?: number; percent?: number; weekly_cap?: number };
  tiers: { revenue: number; owner_coins: number; admin_coins: number; admins_min: number; admins_max: number; percent: number; weekly_cap: number }[];
  min_weekly_cup: number;
  registration: string;
  last_settlement: { week_start?: string; revenue?: number; owner_coins?: number; admin_coins?: number };
};

export function RoomPanels({
  roomId,
  userId,
  isOwner,
  canManage,
  open,
  onOpenChange,
}: {
  roomId: string;
  userId: string | null;
  isOwner: boolean;
  canManage: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<TabKey>("info");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-start text-sm">لوحة الغرفة</SheetTitle>
        </SheetHeader>

        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold transition-colors",
                tab === t.key ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 pb-6">
          {tab === "info" && <InfoPanel roomId={roomId} />}
          {tab === "members" && <MembersPanel roomId={roomId} />}
          {tab === "activities" && <ActivitiesPanel roomId={roomId} userId={userId} canManage={canManage} />}
          {tab === "treasure" && <TreasurePanel roomId={roomId} />}
          {tab === "rewards" && <RewardsPanel roomId={roomId} isOwner={isOwner} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

function InfoPanel({ roomId }: { roomId: string }) {
  const room = useQuery({
    queryKey: ["room-info", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("name, room_code, description, category, member_count, mic_count, popularity")
        .eq("id", roomId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const treasure = useQuery({
    queryKey: ["room-treasure", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_treasure_state", { _room_id: roomId });
      if (error) throw new Error(error.message);
      return data as unknown as TreasureState;
    },
  });
  const rewards = useQuery({
    queryKey: ["room-rewards", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_rewards_state", { _room_id: roomId });
      if (error) throw new Error(error.message);
      return data as unknown as RewardsState;
    },
  });

  if (room.isLoading) return <Loading />;

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-border/60 bg-surface/70 p-3">
        <p className="text-sm font-black">{room.data?.name}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">ID: {room.data?.room_code} · {room.data?.category}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="الأعضاء" value={String(room.data?.member_count ?? 0)} />
        <Stat label="المايكات" value={String(room.data?.mic_count ?? 0)} />
        <Stat label="الشعبية" value={formatCompact(room.data?.popularity ?? 0)} />
      </div>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> مكافآت الغرفة
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          صندوق الكنز: المستوى {treasure.data?.level ?? 1} — التقدّم {formatCompact(treasure.data?.progress ?? 0)} من{" "}
          {formatCompact(treasure.data?.current?.target ?? 0)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          كأس الغرفة هذا الأسبوع: {formatCompact(rewards.data?.weekly_revenue ?? 0)} · نسبة المكافأة{" "}
          {rewards.data?.tier?.percent ?? 0}%
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-surface/70 p-3">
        <p className="text-xs font-bold">الإعلان</p>
        <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
          {room.data?.description || "لا يوجد إعلان في هذه الغرفة."}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface/70 p-2 text-center">
      <p className="text-sm font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MembersPanel({ roomId }: { roomId: string }) {
  const members = useQuery({
    queryKey: ["room-panel-members", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_members")
        .select("user_id, joined_at, profiles:user_id(display_name, avatar_url, frame_url, vip_level, level)")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (members.isLoading) return <Loading />;
  if ((members.data ?? []).length === 0)
    return <p className="py-8 text-center text-xs text-muted-foreground">لا يوجد أعضاء داخل الغرفة الآن.</p>;

  return (
    <div className="space-y-1.5">
      {(members.data ?? []).map((m) => {
        const p = m.profiles as unknown as { display_name: string; avatar_url: string | null; frame_url: string | null; vip_level: number; level: number } | null;
        return (
          <div key={m.user_id} className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface/70 p-2">
            <UserAvatar src={p?.avatar_url ?? null} frame={p?.frame_url ?? null} vipLevel={p?.vip_level ?? 0} name={p?.display_name ?? ""} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{p?.display_name ?? "مستخدم"}</p>
              <p className="text-[10px] text-muted-foreground">
                المستوى {p?.level ?? 0}
                {p?.vip_level ? ` · VIP${p.vip_level}` : ""}
              </p>
            </div>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        );
      })}
    </div>
  );
}

function ActivitiesPanel({ roomId, userId, canManage }: { roomId: string; userId: string | null; canManage: boolean }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("chat");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(60);

  const list = useQuery({
    queryKey: ["room-activities", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_activities")
        .select("id, title, kind, description, starts_at, duration_minutes, status")
        .eq("room_id", roomId)
        .order("starts_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("يجب تسجيل الدخول");
      if (title.trim().length < 2) throw new Error("اكتب موضوع النشاط");
      const { error } = await supabase.from("room_activities").insert({
        room_id: roomId,
        title: title.trim(),
        kind,
        description: description.trim() || null,
        starts_at: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
        duration_minutes: Math.max(5, Math.min(1440, duration)),
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم إنشاء النشاط");
      setCreating(false);
      setTitle("");
      setDescription("");
      setStartsAt("");
      void list.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إنشاء النشاط"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("room_activities").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void list.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحذف"),
  });

  return (
    <div className="space-y-2">
      {canManage && !creating && (
        <Button onClick={() => setCreating(true)} className="h-11 w-full rounded-2xl gradient-gold text-xs font-bold text-primary-foreground">
          إنشاء نشاط جديد
        </Button>
      )}

      {canManage && creating && (
        <div className="space-y-2 rounded-2xl border border-primary/30 bg-surface/70 p-3">
          <p className="text-xs font-bold">إنشاء نشاط الغرفة</p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="موضوع النشاط" className="h-10 rounded-xl text-xs" maxLength={40} />
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-[11px] font-bold",
                  kind === k.key ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 100))}
            placeholder="شرح النشاط"
            className="h-20 w-full rounded-xl border border-border bg-surface-2 p-2 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">وقت البدء</span>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-10 rounded-xl text-xs" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-muted-foreground">المدة (دقيقة)</span>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 60)}
                className="h-10 rounded-xl text-xs"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button disabled={create.isPending} onClick={() => create.mutate()} className="h-10 flex-1 rounded-xl gradient-gold text-xs font-bold text-primary-foreground">
              خطوة تالية
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)} className="h-10 flex-1 rounded-xl text-xs">
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {list.isLoading ? (
        <Loading />
      ) : (list.data ?? []).length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">لا توجد نشاطات في هذه الغرفة بعد.</p>
      ) : (
        (list.data ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-border/60 bg-surface/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{a.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {ACTIVITY_KINDS.find((k) => k.key === a.kind)?.label ?? a.kind} ·{" "}
                  {new Date(a.starts_at).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })} · {a.duration_minutes} دقيقة
                </p>
              </div>
              {canManage && (
                <button type="button" onClick={() => remove.mutate(a.id)} className="text-[10px] font-bold text-destructive">
                  حذف
                </button>
              )}
            </div>
            {a.description && <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-muted-foreground">{a.description}</p>}
          </div>
        ))
      )}
    </div>
  );
}

function TreasurePanel({ roomId }: { roomId: string }) {
  const state = useQuery({
    queryKey: ["room-treasure", roomId],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_treasure_state", { _room_id: roomId });
      if (error) throw new Error(error.message);
      return data as unknown as TreasureState;
    },
  });

  if (state.isLoading) return <Loading />;
  const s = state.data;
  if (!s) return <p className="py-8 text-center text-xs text-muted-foreground">تعذر تحميل صندوق الكنز.</p>;

  const target = Number(s.current?.target ?? 0);
  const pct = target > 0 ? Math.min(100, Math.round((Number(s.progress) / target) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-primary/40 bg-gradient-to-b from-primary/15 to-transparent p-4 text-center">
        <p className="text-[11px] text-muted-foreground">صندوق كنز الغرفة</p>
        <p className="mt-1 text-lg font-black text-primary">{s.current?.name ?? `المستوى ${s.level}`}</p>
        <div className="mx-auto mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full gradient-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] font-bold">
          {formatCompact(Number(s.progress))} / {formatCompact(target)} ({pct}%)
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">قدّم هدية لفتح صندوق الكنز — فُتح {s.total_opened} مرة</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold">جوائز هذا المستوى</p>
        <div className="grid grid-cols-3 gap-2">
          {(s.current?.prizes ?? []).map((p) => (
            <div key={p.rank} className="rounded-2xl border border-border/60 bg-surface/70 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">المركز {p.rank}</p>
              <p className="text-xs font-black text-primary">{formatCompact(Number(p.coins))} 🪙</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1 text-xs font-bold">
          <Gift className="h-3.5 w-3.5 text-primary" /> أكبر المساهمين
        </p>
        {s.contributors.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">لا مساهمات في الدورة الحالية.</p>
        ) : (
          <div className="space-y-1.5">
            {s.contributors.slice(0, 10).map((c, i) => (
              <div key={c.user_id} className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface/70 p-2">
                <span className="w-4 text-center text-[11px] font-black text-primary">{i + 1}</span>
                <UserAvatar url={c.avatar_url} name={c.display_name ?? ""} size={30} />
                <p className="min-w-0 flex-1 truncate text-xs font-bold">{c.display_name ?? "مستخدم"}</p>
                <p className="text-[11px] font-bold text-primary">{formatCompact(Number(c.amount))}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-bold">مستويات الصندوق</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(s.levels ?? []).map((l) => (
            <div
              key={l.level}
              className={cn(
                "w-24 shrink-0 rounded-2xl border p-2 text-center",
                l.level === s.level ? "border-primary bg-primary/10" : "border-border/60 bg-surface/70",
              )}
            >
              <p className="text-[11px] font-black">Lv{l.level}</p>
              <p className="truncate text-[10px] text-muted-foreground">{l.name}</p>
              <p className="mt-1 text-[10px] font-bold text-primary">{formatCompact(Number(l.target))}</p>
            </div>
          ))}
        </div>
      </div>

      {s.recent_opens.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold">آخر عمليات الفتح</p>
          <div className="space-y-1.5">
            {s.recent_opens.map((o, i) => (
              <div key={`${o.created_at}-${i}`} className="flex items-center justify-between rounded-2xl border border-border/60 bg-surface/70 p-2 text-[11px]">
                <span>Lv{o.level}</span>
                <span className="font-bold text-primary">{formatCompact(Number(o.total_prize))} 🪙</span>
                <span className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RewardsPanel({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const state = useQuery({
    queryKey: ["room-rewards", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_rewards_state", { _room_id: roomId });
      if (error) throw new Error(error.message);
      return data as unknown as RewardsState;
    },
  });

  const register = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("room_support_register", { _room_id: roomId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تسجيل الغرفة في خطة الدعم");
      void state.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التسجيل"),
  });

  if (state.isLoading) return <Loading />;
  const s = state.data;
  if (!s) return <p className="py-8 text-center text-xs text-muted-foreground">تعذر تحميل جوائز الغرفة.</p>;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-primary/40 bg-gradient-to-b from-primary/15 to-transparent p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <Trophy className="h-4 w-4" /> كأس الغرفة الأسبوعي
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="هذا الأسبوع" value={formatCompact(Number(s.weekly_revenue))} />
          <Stat label="الأسبوع الماضي" value={formatCompact(Number(s.last_week_revenue))} />
          <Stat label="نسبة المكافأة" value={`${s.tier?.percent ?? 0}%`} />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          حد التسجيل: {formatCompact(Number(s.min_weekly_cup))} · الحالة:{" "}
          {s.registration === "active" ? "مسجّلة" : "غير مسجّلة"}
        </p>
        {isOwner && s.registration !== "active" && (
          <Button
            disabled={register.isPending}
            onClick={() => register.mutate()}
            className="mt-3 h-11 w-full rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
          >
            تسجيل
          </Button>
        )}
      </div>

      {s.tier?.owner_coins !== undefined && (
        <div className="rounded-2xl border border-border/60 bg-surface/70 p-3 text-[11px]">
          <p className="font-bold">شريحتك الحالية</p>
          <p className="mt-1 text-muted-foreground">
            مكافأة المالك {formatCompact(Number(s.tier.owner_coins ?? 0))} · إجمالي مكافأة الادمن{" "}
            {formatCompact(Number(s.tier.admin_coins ?? 0))} · الحد الأسبوعي {formatCompact(Number(s.tier.weekly_cap ?? 0))}
          </p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-bold">جدول دعم الغرفة</p>
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-[10px]">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="p-2">إيراد الأسبوع</th>
                <th className="p-2">مكافأة المالك</th>
                <th className="p-2">مكافأة الادمن</th>
                <th className="p-2">النسبة</th>
                <th className="p-2">الحد الأسبوعي</th>
              </tr>
            </thead>
            <tbody>
              {(s.tiers ?? []).map((t) => (
                <tr key={t.revenue} className={cn("border-t border-border/40", Number(s.tier?.revenue) === t.revenue && "bg-primary/10")}>
                  <td className="p-2 text-center">&gt;{formatCompact(Number(t.revenue))}</td>
                  <td className="p-2 text-center">{formatCompact(Number(t.owner_coins))}</td>
                  <td className="p-2 text-center">{formatCompact(Number(t.admin_coins))}</td>
                  <td className="p-2 text-center">{t.percent}%</td>
                  <td className="p-2 text-center text-primary">{formatCompact(Number(t.weekly_cap))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {s.last_settlement?.week_start && (
        <div className="rounded-2xl border border-border/60 bg-surface/70 p-3 text-[11px]">
          <p className="flex items-center gap-1 font-bold">
            <Crown className="h-3.5 w-3.5 text-primary" /> آخر توزيع
          </p>
          <p className="mt-1 text-muted-foreground">
            أسبوع {s.last_settlement.week_start} · إيراد {formatCompact(Number(s.last_settlement.revenue ?? 0))} · المالك{" "}
            {formatCompact(Number(s.last_settlement.owner_coins ?? 0))} · الادمن {formatCompact(Number(s.last_settlement.admin_coins ?? 0))}
          </p>
        </div>
      )}
    </div>
  );
}
