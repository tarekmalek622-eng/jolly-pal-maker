import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Crown, Gem, Heart, Sparkles } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMyRelationships,
  relationDurationLabel,
  RELATION_LABELS,
  RELATION_TYPES,
  relationLevelInfo,
  type RelationType,
} from "@/lib/relationships";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

const VISUALS = {
  soulmate: { icon: Heart, className: "relationship-soulmate" },
  favorite_friend: { icon: Crown, className: "relationship-favorite" },
  close_friend: { icon: Sparkles, className: "relationship-close" },
  couple: { icon: Gem, className: "relationship-duo" },
} satisfies Record<RelationType, { icon: typeof Heart; className: string }>;

/** عدد الشهور المكتملة على العلاقة لعرض ذكراها. */
function monthsSince(startedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

type Person = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  frame_url: string | null;
  vip_level: number;
};

export function RelationshipShowcase({ userId, own = false }: { userId: string; own?: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["relationship-showcase", userId],
    queryFn: async () => {
      const rows = await fetchMyRelationships(userId, !own);
      const ids = [
        ...new Set(
          rows.map((row) => (row.requester_id === userId ? row.partner_id : row.requester_id)),
        ),
      ];
      if (ids.length === 0) return { rows, people: [] as Person[] };
      const { data, error } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, frame_url, vip_level")
        .in("id", ids);
      if (error) throw error;
      return { rows, people: (data ?? []) as Person[] };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`relationship-showcase-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "relationships" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["relationship-showcase", userId] });
      })
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [queryClient, userId]);

  const people = new Map((query.data?.people ?? []).map((person) => [person.id, person]));

  return (
    <section className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black">علاقاتي المميزة</h2>
          <p className="text-[10px] text-muted-foreground">أربع روابط مستقلة تظهر للطرفين</p>
        </div>
        {own && (
          <Link to="/friends" className="text-[11px] font-bold text-primary">
            إدارة الطلبات
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {/* العلاقة الأساسية (CP) بعرض كامل، وباقي العلاقات مربعات صغيرة تحتها */}
        {(() => {
          const type: RelationType = "couple";
          const row = (query.data?.rows ?? []).find((item) => item.type === type);
          const otherId = row
            ? row.requester_id === userId
              ? row.partner_id
              : row.requester_id
            : null;
          const person = otherId ? people.get(otherId) : null;
          const visual = VISUALS[type];
          const Icon = visual.icon;
          const info = row ? relationLevelInfo(row.points ?? 0) : null;
          return (
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border p-3",
                visual.className,
                info && row?.status === "accepted" && info.current.ring,
                info && row?.status === "accepted" && info.current.glow,
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-black">
                <Icon className="h-3.5 w-3.5" />
                CP · {RELATION_LABELS[type]}
              </div>
              {query.isLoading ? (
                <div className="mt-3 h-16 animate-pulse rounded-xl bg-background/20" />
              ) : person && row ? (
                <Link
                  to="/u/$publicId"
                  params={{ publicId: person.public_id }}
                  className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"
                >
                  <UserAvatar
                    src={person.avatar_url}
                    frame={person.frame_url}
                    name={person.display_name}
                    vipLevel={person.vip_level}
                    size={52}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black">{person.display_name}</p>
                    <p className="text-[9px] opacity-75">ID: {person.public_id}</p>
                    <p className="text-[9px] font-bold">
                      {row.status === "pending"
                        ? "بانتظار الموافقة"
                        : (relationDurationLabel(row.started_at) ?? "نشطة")}
                     </p>
                    {row.status === "accepted" && monthsSince(row.started_at) >= 1 && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-background/30 px-2 py-0.5 text-[9px] font-black">
                        🎂 ذكرى {monthsSince(row.started_at)} شهر
                      </p>
                    )}
                     {row.status === "accepted" && info && (
                      <div className="mt-1">
                        <div
                          className={cn(
                            "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black",
                            info.current.badge,
                          )}
                        >
                          {info.current.level === 7 && <Crown className="h-3 w-3" />}
                          مستوى {info.current.level} · {info.current.name}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/40">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400"
                            style={{ width: `${info.progress}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[8px] opacity-80">
                          <span>{formatCoins(info.points)} نقطة دعم</span>
                          <span>
                            {info.next ? `يتبقى ${formatCoins(info.remaining)}` : "أعلى مستوى"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="grid min-h-14 place-items-center text-center text-[10px] opacity-70">
                  لم يتم اختيار شخص بعد
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-3 gap-2">
          {RELATION_TYPES.filter((type) => type !== "couple").map((type) => {
            const row = (query.data?.rows ?? []).find((item) => item.type === type);
            const otherId = row
              ? row.requester_id === userId
                ? row.partner_id
                : row.requester_id
              : null;
            const person = otherId ? people.get(otherId) : null;
            const visual = VISUALS[type];
            const Icon = visual.icon;
            const info = row ? relationLevelInfo(row.points ?? 0) : null;
            return (
              <div
                key={type}
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-2",
                  visual.className,
                  info && row?.status === "accepted" && info.current.ring,
                )}
              >
                <div className="flex items-center gap-1 text-[9px] font-black">
                  <Icon className="h-3 w-3" />
                  <span className="truncate">{RELATION_LABELS[type]}</span>
                </div>
                {person && row ? (
                  <Link
                    to="/u/$publicId"
                    params={{ publicId: person.public_id }}
                    className="mt-1 flex flex-col items-center text-center"
                  >
                    <UserAvatar
                      src={person.avatar_url}
                      frame={person.frame_url}
                      name={person.display_name}
                      vipLevel={person.vip_level}
                      size={34}
                    />
                    <span className="mt-1 w-full truncate text-[9px] font-bold">
                      {person.display_name}
                    </span>
                    {row.status === "accepted" && info && (
                      <span className="text-[8px] opacity-80">مستوى {info.current.level}</span>
                    )}
                  </Link>
                ) : (
                  <div className="grid h-14 place-items-center text-[9px] opacity-70">فارغ</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
