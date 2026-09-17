import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, CalendarDays, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
};

const KIND_META: Record<string, { label: string; icon: typeof Megaphone }> = {
  ad: { label: "إعلان", icon: Megaphone },
  event: { label: "حدث", icon: CalendarDays },
  contest: { label: "مسابقة", icon: Trophy },
};

/** بنر الرئيسية: إعلانات وأحداث ومسابقات تُدار من لوحة الإدارة. */
export function HomeBanners() {
  const banners = useQuery({
    queryKey: ["home-banners"],
    staleTime: 60_000,
    queryFn: async () => {
      const db = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c2: string, v: boolean) => {
              order: (
                c3: string,
                o: { ascending: boolean },
              ) => { limit: (n: number) => Promise<{ data: BannerRow[] | null; error: { message: string } | null }> };
            };
          };
        };
      };
      const { data, error } = await db
        .from("banners")
        .select("id, title, subtitle, image_url, link_url, kind, starts_at, ends_at, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(12);
      if (error) throw new Error(error.message);
      const now = Date.now();
      return (data ?? []).filter(
        (b) =>
          (!b.starts_at || new Date(b.starts_at).getTime() <= now) &&
          (!b.ends_at || new Date(b.ends_at).getTime() >= now),
      );
    },
  });

  const list = banners.data ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % list.length), 5000);
    return () => clearInterval(timer);
  }, [list.length]);

  if (list.length === 0) return null;
  const active = list[Math.min(index, list.length - 1)]!;

  return (
    <section>
      <BannerCard banner={active} />
      {list.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {list.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`بنر ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BannerCard({ banner }: { banner: BannerRow }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(banner.image_url).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [banner.image_url]);

  const meta = KIND_META[banner.kind] ?? KIND_META["ad"]!;
  const Icon = meta.icon;

  const content = (
    <div className="relative h-36 w-full overflow-hidden rounded-3xl border border-border bg-surface sm:h-44">
      {src ? (
        <img src={src} alt={banner.title} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full gradient-gold opacity-70" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold backdrop-blur-md">
          <Icon className="h-3 w-3 text-primary" />
          {meta.label}
        </span>
        <p className="mt-1 truncate text-sm font-bold">{banner.title}</p>
        {banner.subtitle && (
          <p className="truncate text-[11px] text-muted-foreground">{banner.subtitle}</p>
        )}
      </div>
    </div>
  );

  if (!banner.link_url) return content;
  const internal = banner.link_url.startsWith("/");
  return (
    <a
      href={banner.link_url}
      {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
      className="block"
    >
      {content}
    </a>
  );
}
