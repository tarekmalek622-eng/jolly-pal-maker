import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Clock3, Loader2, MessageCircle, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({
    meta: [
      { title: "الأصدقاء — صوتك" },
      { name: "description", content: "أصدقاء صوتك وطلبات الصداقة الواردة والمرسلة بتحديث مباشر." },
      { property: "og:title", content: "الأصدقاء — صوتك" },
      { property: "og:description", content: "إدارة الأصدقاء وطلبات الصداقة داخل صوتك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FriendsPage,
});

type Profile = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  vip_level: number;
  is_online: boolean;
};

function FriendsPage() {
  const { userId } = useSupabaseSession();
  const [tab, setTab] = useState<"friends" | "incoming" | "sent">("friends");

  const data = useQuery({
    queryKey: ["friends-page", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [friendRows, requests] = await Promise.all([
        supabase.from("friends").select("friend_id").eq("user_id", userId!),
        supabase
          .from("friend_requests")
          .select("id, requester_id, addressee_id, status, created_at")
          .or(`requester_id.eq.${userId!},addressee_id.eq.${userId!}`)
          .order("created_at", { ascending: false }),
      ]);
      if (friendRows.error) throw friendRows.error;
      if (requests.error) throw requests.error;
      const ids = new Set<string>();
      for (const row of friendRows.data ?? []) ids.add(row.friend_id);
      for (const row of requests.data ?? []) {
        ids.add(row.requester_id === userId ? row.addressee_id : row.requester_id);
      }
      let profiles: Profile[] = [];
      if (ids.size > 0) {
        const result = await supabase
          .from("profiles")
          .select("id, public_id, display_name, avatar_url, vip_level, is_online")
          .in("id", [...ids]);
        if (result.error) throw result.error;
        profiles = (result.data ?? []) as Profile[];
      }
      return { friends: friendRows.data ?? [], requests: requests.data ?? [], profiles };
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`social-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => void data.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => void data.refetch())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [userId, data]);

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_friend_request", { _request_id: id, _accept: accept });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      toast.success(input.accept ? "تم قبول طلب الصداقة" : "تم رفض الطلب");
      void data.refetch();
    },
    onError: () => toast.error("تعذر تحديث الطلب"),
  });

  const remove = useMutation({
    mutationFn: async (friendId: string) => {
      const { error } = await supabase.rpc("remove_friend", { _friend_id: friendId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف الصديق");
      void data.refetch();
    },
    onError: () => toast.error("تعذر حذف الصديق"),
  });

  const profileById = useMemo(() => new Map((data.data?.profiles ?? []).map((p) => [p.id, p])), [data.data?.profiles]);
  const incoming = (data.data?.requests ?? []).filter((r) => r.addressee_id === userId && r.status === "pending");
  const sent = (data.data?.requests ?? []).filter((r) => r.requester_id === userId && r.status === "pending");

  return (
    <AppShell header={<PageHeader title="الأصدقاء" subtitle={`${data.data?.friends.length ?? 0} صديق`} />}>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
        {([
          ["friends", "الأصدقاء", data.data?.friends.length ?? 0],
          ["incoming", "الواردة", incoming.length],
          ["sent", "المرسلة", sent.length],
        ] as const).map(([key, label, count]) => (
          <Button key={key} variant={tab === key ? "default" : "ghost"} onClick={() => setTab(key)} className="h-10 rounded-xl px-2 text-xs">
            {label} {count > 0 ? `(${count})` : ""}
          </Button>
        ))}
      </div>

      {data.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : tab === "friends" ? (
        (data.data?.friends.length ?? 0) === 0 ? <EmptyState title="لا يوجد أصدقاء بعد" hint="أرسل طلبًا من الملف الشخصي لأي مستخدم" /> :
        <div className="space-y-2">
          {data.data?.friends.map((row) => {
            const person = profileById.get(row.friend_id);
            if (!person) return null;
            return <PersonRow key={row.friend_id} person={person}>
              <Link to="/messages/$userId" params={{ userId: person.id }} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border" aria-label="مراسلة"><MessageCircle className="h-4 w-4" /></Link>
              <Button variant="outline" onClick={() => remove.mutate(person.id)} className="h-9 w-9 rounded-xl p-0" aria-label="حذف الصديق"><UserMinus className="h-4 w-4" /></Button>
            </PersonRow>;
          })}
        </div>
      ) : tab === "incoming" ? (
        incoming.length === 0 ? <EmptyState title="لا توجد طلبات واردة" /> :
        <div className="space-y-2">{incoming.map((request) => {
          const person = profileById.get(request.requester_id);
          if (!person) return null;
          return <PersonRow key={request.id} person={person}>
            <Button onClick={() => respond.mutate({ id: request.id, accept: true })} className="h-9 w-9 rounded-xl p-0" aria-label="قبول"><Check className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => respond.mutate({ id: request.id, accept: false })} className="h-9 w-9 rounded-xl p-0" aria-label="رفض"><X className="h-4 w-4" /></Button>
          </PersonRow>;
        })}</div>
      ) : (
        sent.length === 0 ? <EmptyState title="لا توجد طلبات مرسلة" /> :
        <div className="space-y-2">{sent.map((request) => {
          const person = profileById.get(request.addressee_id);
          if (!person) return null;
          return <PersonRow key={request.id} person={person}><Clock3 className="h-4 w-4 text-muted-foreground" /></PersonRow>;
        })}</div>
      )}
    </AppShell>
  );
}

function PersonRow({ person, children }: { person: Profile; children: ReactNode }) {
  return (
    <div className="surface-card flex items-center gap-3 p-3">
      <Link to="/u/$publicId" params={{ publicId: person.public_id }}>
        <UserAvatar src={person.avatar_url} name={person.display_name} size={44} vipLevel={person.vip_level} online={person.is_online} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{person.display_name}</p>
        <p className={cn("text-[10px]", person.is_online ? "text-success" : "text-muted-foreground")}>{person.is_online ? "متصل الآن" : "غير متصل"}</p>
      </div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}