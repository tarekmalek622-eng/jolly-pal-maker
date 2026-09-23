import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/use-session";
import { badgeArt } from "@/lib/badge-art";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "الشارات والإنجازات — التاج" },
      {
        name: "description",
        content: "تابع تقدّمك في الإنجازات واحصل على شارات عند إرسال الهدايا وتحقيق الأهداف.",
      },
      { property: "og:title", content: "الشارات والإنجازات — التاج" },
      { property: "og:description", content: "شارات تُفتح تلقائيًا مع تقدّمك في التاج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AchievementsPage,
});

function AchievementsPage() {
  const { userId } = useSupabaseSession();

  const data = useQuery({
    queryKey: ["achievements", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [defs, mine, sent] = await Promise.all([
        supabase
          .from("badge_definitions")
          .select("id, key, name, description, kind, threshold, style_key, image_url, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_badges")
          .select("badge_id, progress, awarded_at")
          .eq("user_id", userId!),
        supabase
          .from("gift_transactions")
          .select("total_price")
          .eq("sender_id", userId!)
          .limit(1000),
      ]);
      if (defs.error) throw defs.error;
      if (mine.error) throw mine.error;
      if (sent.error) throw sent.error;
      const totalSent = (sent.data ?? []).reduce(
        (sum, row) => sum + Number(row.total_price ?? 0),
        0,
      );
      const progressMax = (mine.data ?? []).reduce(
        (max, row) => Math.max(max, Number(row.progress ?? 0)),
        0,
      );
      return {
        definitions: defs.data ?? [],
        owned: new Map((mine.data ?? []).map((row) => [row.badge_id, row])),
        totalSent: Math.max(totalSent, progressMax),
      };
    },
  });

  const definitions = data.data?.definitions ?? [];
  const owned = data.data?.owned;
  const totalSent = data.data?.totalSent ?? 0;
  const giftBadges = definitions.filter((b) => b.kind === "gift");
  const otherOwned = definitions.filter((b) => b.kind !== "gift" && owned?.has(b.id));
  const unlocked = definitions.filter((b) => owned?.has(b.id)).length;

  return (
    <AppShell
      header={<PageHeader title="الشارات والإنجازات" subtitle="تقدّمك يفتح شارات جديدة تلقائيًا" />}
    >
      <section className="surface-card mb-4 flex items-center gap-4 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
          <Award className="h-6 w-6 text-primary" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold">
            {unlocked} من {definitions.length} شارة
          </p>
          <p className="text-[11px] text-muted-foreground">
            إجمالي الهدايا المرسلة: {formatCoins(totalSent)}
          </p>
        </div>
      </section>

      {data.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : data.isError ? (
        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          <p className="text-sm font-semibold">تعذر تحميل الشارات</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.error instanceof Error ? data.error.message : "تحقق من الاتصال"}
          </p>
          <Button
            onClick={() => void data.refetch()}
            className="mt-3 h-10 rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : giftBadges.length === 0 && otherOwned.length === 0 ? (
        <EmptyState title="لا توجد شارات بعد" hint="أرسل هدايا لتفتح أول شارة إنجاز" />
      ) : (
        <>
          {giftBadges.length > 0 && (
            <section className="mb-6 space-y-3">
              <h2 className="text-sm font-bold text-muted-foreground">إنجازات الهدايا</h2>
              {giftBadges.map((badge) => {
                const threshold = Math.max(1, Number(badge.threshold ?? 0));
                const isOwned = owned?.has(badge.id) ?? false;
                const percent = Math.min(100, Math.round((totalSent / threshold) * 100));
                const art = badge.image_url || badgeArt(badge.key, badge.style_key);
                return (
                  <div
                    key={badge.id}
                    className={cn(
                      "surface-card flex items-center gap-3 p-3",
                      isOwned ? "border-primary/50" : "opacity-90",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface",
                        !isOwned && "grayscale",
                      )}
                    >
                      {art ? (
                        <img src={art} alt={badge.name} className="h-full w-full object-contain" />
                      ) : (
                        <Award className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-bold">{badge.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                            isOwned
                              ? "gradient-gold text-primary-foreground"
                              : "bg-surface text-muted-foreground",
                          )}
                        >
                          {isOwned ? "مفتوحة" : `${percent}%`}
                        </span>
                      </div>
                      {badge.description && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {badge.description}
                        </p>
                      )}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full gradient-gold" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatCoins(Math.min(totalSent, threshold))} / {formatCoins(threshold)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {otherOwned.length > 0 && (
            <section className="space-y-3 pb-6">
              <h2 className="text-sm font-bold text-muted-foreground">شارات أخرى حصلت عليها</h2>
              <div className="grid grid-cols-3 gap-3">
                {otherOwned.map((badge) => {
                  const art = badge.image_url || badgeArt(badge.key, badge.style_key);
                  return (
                    <div
                      key={badge.id}
                      className="surface-card flex flex-col items-center gap-2 p-3"
                    >
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-surface">
                        {art ? (
                          <img
                            src={art}
                            alt={badge.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Award className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-center text-[10px] font-bold">{badge.name}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
