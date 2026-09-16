import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Flame, Sparkles, Users, Crown, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { useSupabaseSession, useMyProfile, useWallet } from "@/hooks/use-session";
import { RoomCard, type RoomRow } from "@/components/RoomCard";
import { EmptyState } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "الرئيسية — صوتك" },
      { name: "description", content: "استعرض الغرف الصوتية النشطة والمشهورة والجديدة وابحث عن الأصدقاء برقم ID." },
      { property: "og:title", content: "الرئيسية — صوتك" },
      { property: "og:description", content: "غرف صوتية نشطة، مستخدمون متصلون، وهدايا مباشرة." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { userId } = useSupabaseSession();
  const profile = useMyProfile(userId);
  const wallet = useWallet(userId);
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<
    "all" | "active" | "new" | "featured" | "public" | "private" | "games" | "voice"
  >("all");

  const rooms = useQuery({
    queryKey: ["rooms", "discovery"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_code, name, description, image_url, category, room_type, member_count, popularity, created_at, owner_id, mic_count")
        .eq("is_disabled", false)
        .order("member_count", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
    refetchInterval: 20000,
  });

  const onlineUsers = useQuery({
    queryKey: ["online-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level, is_online, level")
        .order("last_seen", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const searchResults = useQuery({
    queryKey: ["search", term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const q = term.trim();
      const [users, byRoom] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, public_id, display_name, avatar_url, vip_level, level, is_online")
          .or(`display_name.ilike.%${q}%,public_id.eq.${/^\d+$/.test(q) ? q : "0"}`)
          .limit(10),
        supabase
          .from("rooms")
          .select("id, room_code, name, description, image_url, category, room_type, member_count, popularity, created_at, owner_id, mic_count")
          .or(`name.ilike.%${q}%,room_code.eq.${/^\d+$/.test(q) ? q : "0"}`)
          .limit(10),
      ]);
      return { users: users.data ?? [], rooms: (byRoom.data ?? []) as RoomRow[] };
    },
  });

  const list = rooms.data ?? [];
  const dayMs = 24 * 60 * 60 * 1000;
  const filters = {
    all: (r: RoomRow) => true,
    active: (r: RoomRow) => r.member_count > 0,
    new: (r: RoomRow) => Date.now() - new Date(r.created_at).getTime() < 3 * dayMs,
    featured: (r: RoomRow) => r.member_count >= 10 || r.popularity >= 100,
    public: (r: RoomRow) => r.room_type === "public",
    private: (r: RoomRow) => r.room_type === "private",
    games: (r: RoomRow) => r.category === "games",
    voice: (r: RoomRow) => r.category === "voice" || r.category === "music",
  } as const;
  type FilterKey = keyof typeof filters;
  const trending = [...list]
    .filter(filters[tab])
    .sort((a, b) => b.member_count - a.member_count || b.popularity - a.popularity)
    .slice(0, 24);

  const ownerIds = [...new Set(list.map((r) => r.owner_id))].sort();
  const owners = useQuery({
    queryKey: ["room-owners", ownerIds],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ownerIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name])) as Record<string, string>;
    },
  });

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 bg-background/85 px-4 pb-3 pt-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link to="/me">
              <UserAvatar
                src={profile.data?.avatar_url}
                name={profile.data?.display_name}
                size={44}
                vipLevel={profile.data?.vip_level ?? 0}
              />
            </Link>
            <div className="flex-1">
              <p className="text-sm font-bold">{profile.data?.display_name ?? "..."}</p>
              <p className="text-[11px] text-muted-foreground">ID: {profile.data?.public_id ?? "—"}</p>
            </div>
            <Link
              to="/wallet"
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold"
            >
              <Coins className="h-4 w-4 text-primary" />
              {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
            </Link>
          </div>
          <div className="relative mt-3">
            <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="ابحث باسم المستخدم أو ID أو اسم الغرفة أو رقمها"
              className="h-11 rounded-2xl border-border bg-surface pe-10 text-sm"
            />
          </div>
        </header>
      }
    >
      {term.trim().length >= 2 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground">نتائج البحث</h2>
          {(searchResults.data?.users.length ?? 0) === 0 && (searchResults.data?.rooms.length ?? 0) === 0 ? (
            <EmptyState title="لا توجد نتائج" hint="جرّب اسمًا آخر أو رقم ID" />
          ) : (
            <>
              {searchResults.data?.users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => void navigate({ to: "/u/$publicId", params: { publicId: u.public_id } })}
                  className="surface-card flex w-full items-center gap-3 p-3 text-start"
                >
                  <UserAvatar src={u.avatar_url} name={u.display_name} size={44} vipLevel={u.vip_level} online={u.is_online} />
                  <div>
                    <p className="text-sm font-semibold">{u.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">ID: {u.public_id} · مستوى {u.level}</p>
                  </div>
                </button>
              ))}
              {searchResults.data?.rooms.map((r) => <RoomCard key={r.id} room={r} />)}
            </>
          )}
        </section>
      ) : (
        <div className="space-y-7">
          <section>
            <SectionTitle icon={Flame} title="الغرف" />
            {trending.length === 0 ? (
              <EmptyState
                title="لا توجد غرف بعد"
                hint="كن أول من ينشئ غرفة صوتية"
                action={
                  <Link to="/rooms" className="mt-3 rounded-full gradient-gold px-4 py-2 text-xs font-bold text-primary-foreground">
                    إنشاء غرفة
                  </Link>
                }
              />
            ) : (
              <div className="space-y-4">
                {trending.map((r) => (
                  <RoomCard key={r.id} room={r} ownerName={owners.data?.[r.owner_id]} />
                ))}
              </div>
            )}
          </section>


          <section>
            <SectionTitle icon={Users} title="مستخدمون نشطون" />
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(onlineUsers.data ?? []).map((u) => (
                <Link
                  key={u.id}
                  to="/u/$publicId"
                  params={{ publicId: u.public_id }}
                  className="flex w-16 shrink-0 flex-col items-center gap-1"
                >
                  <UserAvatar src={u.avatar_url} name={u.display_name} size={54} vipLevel={u.vip_level} online={u.is_online} />
                  <span className="w-full truncate text-center text-[11px] text-muted-foreground">{u.display_name}</span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle icon={Crown} title="اكتشف المزيد" />
            <div className="grid grid-cols-2 gap-3">
              <Link to="/store" className="surface-card gradient-vip p-4 text-sm font-bold">المتجر وVIP</Link>
              <Link to="/games" className="surface-card gradient-rose p-4 text-sm font-bold">الألعاب</Link>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Flame; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-bold">{title}</h2>
    </div>
  );
}
