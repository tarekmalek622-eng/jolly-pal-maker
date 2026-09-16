import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Ban, Crown, Flag, MessageCircle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/u/$publicId")({
  head: () => ({
    meta: [
      { title: "ملف مستخدم — صوتك" },
      { name: "description", content: "استعرض ملف المستخدم: المستوى وVIP والمتابعين، وأرسل رسالة أو طلب صداقة." },
      { property: "og:title", content: "ملف مستخدم — صوتك" },
      { property: "og:description", content: "المستوى، VIP، المتابعون وخيارات التواصل." },
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

  const profile = useQuery({
    queryKey: ["profile-public", publicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, frame_url, bio, country, city, level, xp, vip_level, is_cvip, is_online")
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const target = profile.data;
  const isMe = target?.id === userId;

  const relation = useQuery({
    queryKey: ["relation", userId, target?.id],
    enabled: Boolean(userId && target?.id && !isMe),
    queryFn: async () => {
      const [follow, friend] = await Promise.all([
        supabase.from("follows").select("id").eq("follower_id", userId!).eq("following_id", target!.id).maybeSingle(),
        supabase.from("friends").select("id").eq("user_id", userId!).eq("friend_id", target!.id).maybeSingle(),
      ]);
      return { following: Boolean(follow.data), friend: Boolean(friend.data) };
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      if (relation.data?.following) {
        const { error } = await supabase.from("follows").delete().eq("follower_id", userId).eq("following_id", target.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: userId, following_id: target.id });
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
      const { error } = await supabase
        .from("friend_requests")
        .insert({ requester_id: userId, addressee_id: target.id, status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم إرسال طلب الصداقة"),
    onError: () => toast.error("تم إرسال الطلب مسبقًا أو حدث خطأ"),
  });

  const block = useMutation({
    mutationFn: async () => {
      if (!userId || !target) return;
      const { error } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: target.id });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم حجب المستخدم"),
    onError: () => toast.error("تعذر الحجب"),
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

  return (
    <AppShell
      hideNav
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <button onClick={() => void navigate({ to: "/home" })} className="p-1">
            <ArrowRight className="h-5 w-5" />
          </button>
          <p className="font-bold">الملف الشخصي</p>
        </header>
      }
    >
      <div className="surface-card p-5 text-center">
        <div className="flex justify-center">
          <UserAvatar src={target.avatar_url} name={target.display_name} size={88} vipLevel={target.vip_level} frame={target.frame_url} online={target.is_online} />
        </div>
        <p className="mt-3 text-lg font-bold">{target.display_name}</p>
        <p className="text-[11px] text-muted-foreground">ID: {target.public_id}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">مستوى {target.level}</span>
          {target.vip_level > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
              <Crown className="h-3 w-3" /> VIP {target.vip_level}
            </span>
          )}
          {target.country && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">{target.country}</span>}
        </div>
        {target.bio && <p className="mt-3 text-sm text-muted-foreground">{target.bio}</p>}
      </div>

      {!isMe && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              onClick={() => toggleFollow.mutate()}
              className="h-12 rounded-2xl gradient-gold font-bold text-primary-foreground"
            >
              {relation.data?.following ? "إلغاء المتابعة" : "متابعة"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void navigate({ to: "/messages/$userId", params: { userId: target.id } })}
              className="h-12 rounded-2xl"
            >
              <MessageCircle className="me-2 h-4 w-4" /> رسالة
            </Button>
            <Button variant="outline" onClick={() => addFriend.mutate()} className="h-12 rounded-2xl">
              <UserPlus className="me-2 h-4 w-4" /> طلب صداقة
            </Button>
            <Button variant="outline" onClick={() => setReporting((v) => !v)} className="h-12 rounded-2xl">
              <Flag className="me-2 h-4 w-4" /> إبلاغ
            </Button>
          </div>

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

          <Button
            variant="outline"
            onClick={() => block.mutate()}
            className="mt-4 h-12 w-full rounded-2xl border-destructive/40 text-destructive"
          >
            <Ban className="me-2 h-4 w-4" /> حجب المستخدم
          </Button>
        </>
      )}
    </AppShell>
  );
}
