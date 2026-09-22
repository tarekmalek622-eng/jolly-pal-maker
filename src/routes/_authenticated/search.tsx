import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Loader2, Mic, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { VipName } from "@/components/VipName";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "البحث الموحّد — التاج" },
      { name: "description", content: "ابحث عن المستخدمين بالاسم أو الآيدي، وعن الغرف والعائلات في مكان واحد." },
      { property: "og:title", content: "البحث الموحّد — التاج" },
      { property: "og:description", content: "مستخدمون، غرف وعائلات في بحث واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [term, setTerm] = useState("");
  const q = term.trim();

  const results = useQuery({
    queryKey: ["unified-search", q],
    enabled: q.length >= 1,
    queryFn: async () => {
      const like = `%${q}%`;
      const [users, rooms, families] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, public_id, display_name, avatar_url, frame_url, vip_level, name_color, status_text")
          .or(`display_name.ilike.${like},public_id.ilike.${like}`)
          .limit(12),
        supabase
          .from("rooms")
          .select("id, name, category, image_url, is_verified")
          .eq("is_active", true)
          .ilike("name", like)
          .limit(12),
        supabase.from("families").select("id, name, logo_url, level").ilike("name", like).limit(12),
      ]);
      if (users.error) throw users.error;
      if (rooms.error) throw rooms.error;
      if (families.error) throw families.error;
      return { users: users.data ?? [], rooms: rooms.data ?? [], families: families.data ?? [] };
    },
  });

  const empty =
    results.data &&
    results.data.users.length === 0 &&
    results.data.rooms.length === 0 &&
    results.data.families.length === 0;

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-black">البحث</h1>
        </header>
      }
    >
      <div className="px-4 pb-8">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="اسم مستخدم، آيدي، غرفة أو عائلة"
            className="h-12 rounded-2xl bg-surface-2 pr-10"
          />
        </div>

        {q.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">اكتب حرفًا واحدًا على الأقل لبدء البحث.</p>
        )}

        {results.isLoading && q.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {results.isError && (
          <div className="surface-card mt-6 p-4 text-center">
            <p className="text-sm font-bold">تعذر البحث الآن</p>
            <button
              type="button"
              onClick={() => void results.refetch()}
              className="mt-2 rounded-2xl bg-primary/15 px-4 py-2 text-xs font-bold text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {empty && <p className="mt-8 text-center text-sm text-muted-foreground">لا نتائج مطابقة.</p>}

        {results.data && results.data.users.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-xs font-black text-muted-foreground">المستخدمون</h2>
            <div className="space-y-2">
              {results.data.users.map((u) => (
                <Link
                  key={u.id}
                  to="/u/$publicId"
                  params={{ publicId: u.public_id }}
                  className="surface-card flex items-center gap-3 p-3"
                >
                  <UserAvatar
                    src={u.avatar_url}
                    frame={u.frame_url}
                    name={u.display_name}
                    size={44}
                    vipLevel={u.vip_level ?? 0}
                  />
                  <div className="min-w-0 flex-1">
                    <VipName
                      name={u.display_name}
                      vipLevel={u.vip_level ?? 0}
                      color={u.name_color}
                      className="block truncate text-sm"
                    />
                    <p className="truncate text-[11px] text-muted-foreground">
                      {u.status_text ? u.status_text : `ID: ${u.public_id}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {results.data && results.data.rooms.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-xs font-black text-muted-foreground">الغرف</h2>
            <div className="space-y-2">
              {results.data.rooms.map((r) => (
                <Link
                  key={r.id}
                  to="/rooms/$roomId"
                  params={{ roomId: r.id }}
                  className="surface-card flex items-center gap-3 p-3"
                >
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                    ) : (
                      <Mic className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.category}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {results.data && results.data.families.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-xs font-black text-muted-foreground">العائلات</h2>
            <div className="space-y-2">
              {results.data.families.map((f) => (
                <Link
                  key={f.id}
                  to="/families/$familyId"
                  params={{ familyId: f.id }}
                  className="surface-card flex items-center gap-3 p-3"
                >
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
                    {f.logo_url ? (
                      <img src={f.logo_url} alt={f.name} className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">المستوى {f.level ?? 1}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
