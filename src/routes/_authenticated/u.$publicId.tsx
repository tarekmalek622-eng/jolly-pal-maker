import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Ban,
  Crown,
  DoorOpen,
  Flag,
  HeartHandshake,
  Lock,
  MessageCircle,
  MoreVertical,
  Radio,
  Users,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import {
  RELATION_LABELS,
  RELATION_STYLES,
  RELATION_TYPES,
  fetchMyRelationships,
  replaceRelationship,
  requestRelationship,
  type RelationType,
} from "@/lib/relationships";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseSession } from "@/hooks/use-session";
import { ProfileShowcase } from "@/components/ProfileShowcase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BadgeStrip } from "@/components/BadgeStrip";
import { RelationshipShowcase } from "@/components/RelationshipShowcase";

export const Route = createFileRoute("/_authenticated/u/$publicId")({
  head: () => ({
    meta: [
      { title: "ملف مستخدم — التاج" },
      {
        name: "description",
        content: "استعرض ملف المستخدم: المستوى وVIP والمتابعين، وأرسل رسالة أو طلب صداقة.",
      },
      { property: "og:title", content: "ملف مستخدم — التاج" },
      { property: "og:description", content: "المستوى، VIP، المتابعون وخيارات التواصل." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UserPage,
});

function UserPage() {
  const { publicId } = Route.useParams();
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [relationOpen, setRelationOpen] = useState(false);

  const profile = useQuery({
    queryKey: ["profile-public", publicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, public_id, display_name, avatar_url, frame_url, bio, country, city, level, xp, vip_level, is_cvip, is_online",
        )
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const target = profile.data;

  const currentRoom = useQuery({
    queryKey: ["profile-current-room", target?.id],
    enabled: Boolean(target?.id),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!target?.id) return null;

      const { data: memberships, error: membershipError } = await supabase
        .from("room_members")
        .select("room_id, joined_at")
        .eq("user_id", target.id)
        .order("joined_at", { ascending: false })
        .limit(5);
      if (membershipError) throw membershipError;

      const roomIds = (memberships ?? []).map((membership) => membership.room_id);
      if (roomIds.length === 0) return null;

      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id, name, room_type, member_count, is_active, is_disabled")
        .in("id", roomIds)
        .eq("is_active", true)
        .eq("is_disabled", false);
      if (roomsError) throw roomsError;

      const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
      return roomIds.map((roomId) => roomById.get(roomId)).find(Boolean) ?? null;
    },
  });
  const refetchCurrentRoom = currentRoom.refetch;

  useEffect(() => {
    if (!target?.id) return;
    const channel = supabase
      .channel(`profile-room-${target.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `user_id=eq.${target.id}`,
        },
        () => void refetchCurrentRoom(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [target?.id, refetchCurrentRoom]);

  useEffect(() => {
    if (!userId || !target?.id || target.id === userId) return;
    void supabase
      .from("profile_visits")
      .upsert(
        { profile_id: target.id, visitor_id: userId },
        { onConflict: "profile_id,visitor_id" },
      );
  }, [userId, target?.id]);
  const isMe = target?.id === userId;

  const relation = useQuery({
    queryKey: ["relation", userId, target?.id],
    enabled: Boolean(userId && target?.id && !isMe),
    queryFn: async () => {
      const [follow, friend, request] = await Promise.all([
        supabase
          .from("follows")
          .select("id")
          .eq("follower_id", userId!)
          .eq("following_id", target!.id)
          .maybeSingle(),
        supabase
          .from("friends")
          .select("id")
          .eq("user_id", userId!)
          .eq("friend_id", target!.id)
          .maybeSingle(),
        supabase
          .from("friend_requests")
          .select("id, status")
          .eq("requester_id", userId!)
          .eq("addressee_id", target!.id)
          .eq("status", "pending")
          .maybeSingle(),
      ]);
      return {
        following: Boolean(follow.data),
        friend: Boolean(friend.data),
        pending: Boolean(request.data),
      };
    },
  });

  const specialRelations = useQuery({
    queryKey: ["my-special-relations", userId],
    enabled: Boolean(userId && !isMe),
    queryFn: () => fetchMyRelationships(userId!),
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      if (relation.data?.following) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("following_id", target.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: userId, following_id: target.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void relation.refetch();
    },
    onError: () => toast.error("تعذر تنفيذ الطلب"),
  });

  const addFriend = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      const { error } = await supabase.rpc("send_friend_request", { _addressee_id: target.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال طلب الصداقة");
      void relation.refetch();
    },
    onError: () => toast.error("تم إرسال الطلب مسبقًا أو حدث خطأ"),
  });

  const block = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      const { error } = await supabase
        .from("blocks")
        .insert({ blocker_id: userId, blocked_id: target.id });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم حجب المستخدم"),
    onError: () => toast.error("تعذر الحجب"),
  });

  const askRelation = useMutation({
    mutationFn: async ({ type, replace }: { type: RelationType; replace: boolean }) => {
      if (!target) return;
      if (replace) await replaceRelationship(target.id, type);
      else await requestRelationship(target.id, type);
    },
    onSuccess: () => {
      toast.success("تم إرسال طلب العلاقة");
      setRelationOpen(false);
      void specialRelations.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب"),
  });

  const report = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      if (reason.trim().length < 5) throw new Error("اكتب سبب الإبلاغ");
      const { error } = await supabase.from("reports").insert({
        reporter_id: userId,
        target_type: "user",
        target_id: target.id,
        reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الإبلاغ للإدارة");
      setReporting(false);
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الإبلاغ"),
  });

  if (profile.isLoading) {
    return <AppShell hideNav>جارٍ التحميل...</AppShell>;
  }
  if (!target) {
    return <AppShell hideNav>لا يوجد مستخدم بهذا الرقم.</AppShell>;
  }
  const activeRoom = currentRoom.data;

  return (
    <AppShell
      hideNav
      header={
        <div className="relative">
          <div className="absolute top-1 start-12">
            <BadgeStrip userId={target.id} rank={target.level} count={0} />
          </div>
          <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-background/85 px-4 pb-4 pt-6 backdrop-blur-xl">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void navigate({ to: "/home" })}
              aria-label="العودة"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <p className="truncate font-bold">الملف الشخصي</p>
            {!isMe ? (
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="المزيد من الخيارات">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
                  <DropdownMenuItem onSelect={() => toggleFollow.mutate()}>
                    <UserRoundCheck /> {relation.data?.following ? "إلغاء المتابعة" : "متابعة"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void navigate({ to: "/messages/$userId", params: { userId: target.id } })
                    }
                  >
                    <MessageCircle /> إرسال رسالة
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRelationOpen(true)}>
                    <HeartHandshake /> طلب علاقة اجتماعية
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setReporting(true)}>
                    <Flag /> إبلاغ الإدارة
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => block.mutate()}
                  >
                    <Ban /> حجب المستخدم
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="h-9 w-9" />
            )}
          </header>
        </div>
      }
    >
      <div className="surface-card p-5 text-center">
        <div className="flex justify-center">
          <UserAvatar
            src={target.avatar_url}
            name={target.display_name}
            size={88}
            vipLevel={target.vip_level}
            frame={target.frame_url}
            online={target.is_online}
          />
        </div>
        <p className="mt-3 text-lg font-bold">{target.display_name}</p>
        <p className="text-[11px] text-muted-foreground">ID: {target.public_id}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">
            مستوى {target.level}
          </span>
          {target.vip_level > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
              <Crown className="h-3 w-3" /> VIP {target.vip_level}
            </span>
          )}
          {target.country && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">
              {target.country}
            </span>
          )}
        </div>
        {target.bio && <p className="mt-3 text-sm text-muted-foreground">{target.bio}</p>}
      </div>

      <section className="mt-3 rounded-2xl border border-border bg-surface p-3">
        {currentRoom.isLoading ? (
          <div className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ) : currentRoom.isError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">تعذر معرفة حالة الغرفة الآن</p>
            <Button variant="ghost" size="sm" onClick={() => void currentRoom.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : activeRoom ? (
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
              <Radio className="h-5 w-5" />
              <span className="absolute end-0 top-0 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-surface bg-success" />
            </span>
            <div className="min-w-0 flex-1 text-start">
              <p className="text-[10px] font-bold text-success">موجود في غرفة الآن</p>
              {activeRoom.room_type === "private" ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> غرفة خاصة
                </p>
              ) : (
                <>
                  <p className="mt-0.5 truncate text-sm font-bold">{activeRoom.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Users className="h-3 w-3" /> {activeRoom.member_count} داخل الغرفة
                  </p>
                </>
              )}
            </div>
            {activeRoom.room_type === "public" && (
              <Button
                size="sm"
                onClick={() =>
                  void navigate({
                    to: "/rooms/$roomId",
                    params: { roomId: activeRoom.id },
                  })
                }
                className="h-9 shrink-0 rounded-xl px-3 text-xs font-bold"
              >
                <DoorOpen className="h-4 w-4" /> دخول
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
              <Radio className="h-4 w-4" />
            </span>
            <div className="text-start">
              <p className="text-xs font-semibold">ليس داخل غرفة الآن</p>
              <p className="mt-0.5 text-[10px]">ستظهر الغرفة هنا عند دخوله</p>
            </div>
          </div>
        )}
      </section>

      {!isMe && (
        <>
          <div className="mt-4">
            <Button
              disabled={relation.data?.friend || relation.data?.pending || addFriend.isPending}
              onClick={() => addFriend.mutate()}
              className="h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
            >
              <UserPlus className="me-2 h-4 w-4" />{" "}
              {relation.data?.friend ? "صديق" : relation.data?.pending ? "الطلب مرسل" : "طلب صداقة"}
            </Button>
          </div>

          {relationOpen && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {RELATION_TYPES.map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  disabled={askRelation.isPending}
                  onClick={() => {
                    const occupied = (specialRelations.data ?? []).some((row) => row.type === type);
                    if (
                      occupied &&
                      !window.confirm(
                        `لديك ${RELATION_LABELS[type]} حاليًا. هل تريد إنهاءها وإرسال طلب بديل؟`,
                      )
                    )
                      return;
                    askRelation.mutate({ type, replace: occupied });
                  }}
                  className={`h-12 rounded-2xl border text-xs ${RELATION_STYLES[type]}`}
                >
                  {RELATION_LABELS[type]}
                </Button>
              ))}
            </div>
          )}

          {reporting && (
            <div className="mt-4 space-y-3">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب سبب الإبلاغ بالتفصيل"
                className="rounded-2xl bg-surface"
              />
              <Button
                onClick={() => report.mutate()}
                className="h-12 w-full rounded-2xl gradient-rose font-bold text-primary-foreground"
              >
                إرسال الإبلاغ
              </Button>
            </div>
          )}
        </>
      )}
      <RelationshipShowcase userId={target.id} />
      <ProfileShowcase userId={target.id} />
    </AppShell>
  );
}
