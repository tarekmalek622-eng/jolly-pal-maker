import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { toast } from "sonner";
import {
  ArrowRight,
  Ban,
  Check,
  Gift,
  Hand,
  LayoutGrid,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Send,
  Settings,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { GiftSheet, type GiftTarget } from "@/components/GiftSheet";
import { GiftOverlay, type GiftMediaRow, type GiftShowEvent } from "@/components/GiftMedia";
import { RoomSupporters } from "@/components/RoomSupporters";
import { DominoGame } from "@/components/DominoGame";
import { LiveWheel } from "@/components/LiveWheel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSupabaseSession } from "@/hooks/use-session";
import { useVoiceRoom } from "@/hooks/use-voice-room";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "غرفة صوتية — صوتك" },
      { name: "description", content: "غرفة صوتية مباشرة: مايكات، دردشة نصية، هدايا وإدارة كاملة للمالك والمشرفين." },
      { property: "og:title", content: "غرفة صوتية — صوتك" },
      { property: "og:description", content: "اصعد على المايك، دردش، وأرسل الهدايا مباشرة." },
    ],
  }),
  component: RoomPage,
});

type MicSeat = {
  id: string;
  seat_index: number;
  user_id: string | null;
  is_locked: boolean;
  is_muted: boolean;
};

type Person = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  frame_url: string | null;
  vip_level: number;
  level: number;
};

function RoomPage() {
  const { roomId } = Route.useParams();
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();

  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [dominoOpen, setDominoOpen] = useState(false);
  const [roomGame, setRoomGame] = useState<"wheel" | "domino">("wheel");
  const [seatSheet, setSeatSheet] = useState<string | null>(null);
  const [cupOpen, setCupOpen] = useState(false);
  const [giftTargetId, setGiftTargetId] = useState<string | null>(null);

  const room = useQuery({
    queryKey: ["room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", roomId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const mics = useQuery({
    queryKey: ["room-mics", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_mics")
        .select("id, seat_index, user_id, is_locked, is_muted")
        .eq("room_id", roomId)
        .order("seat_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MicSeat[];
    },
  });

  const members = useQuery({
    queryKey: ["room-members", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_members").select("user_id").eq("room_id", roomId);
      if (error) throw error;
      return (data ?? []).map((m) => m.user_id);
    },
  });

  const seatUserIds = useMemo(
    () => (mics.data ?? []).map((m) => m.user_id).filter((v): v is string => Boolean(v)),
    [mics.data],
  );

  const peopleIds = useMemo(() => {
    const set = new Set<string>([...(members.data ?? []), ...seatUserIds]);
    if (room.data?.owner_id) set.add(room.data.owner_id);
    return [...set];
  }, [members.data, seatUserIds, room.data?.owner_id]);

  const people = useQuery({
    queryKey: ["room-people", roomId, peopleIds.join(",")],
    enabled: peopleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, frame_url, vip_level, level")
        .in("id", peopleIds);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const messages = useQuery({
    queryKey: ["room-messages", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_messages")
        .select("id, user_id, body, kind, metadata, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const moderators = useQuery({
    queryKey: ["room-mods", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_moderators").select("user_id").eq("room_id", roomId);
      if (error) throw error;
      return (data ?? []).map((m) => m.user_id);
    },
  });

  const requests = useQuery({
    queryKey: ["mic-requests", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mic_requests")
        .select("id, user_id, created_at")
        .eq("room_id", roomId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isOwner = room.data?.owner_id === userId;
  const canManage = isOwner || (moderators.data ?? []).includes(userId ?? "");
  const mySeat = (mics.data ?? []).find((m) => m.user_id === userId) ?? null;
  const voice = useVoiceRoom(roomId, Boolean(mySeat && !mySeat.is_muted));

  // join / leave membership
  useEffect(() => {
    if (!userId) return;
    void supabase.from("room_members").upsert(
      { room_id: roomId, user_id: userId, joined_at: new Date().toISOString() },
      { onConflict: "room_id,user_id" },
    );
    return () => {
      void supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
      void supabase.from("room_mics").update({ user_id: null }).eq("room_id", roomId).eq("user_id", userId);
    };
  }, [roomId, userId]);

  // طبقة عرض تأثيرات الهدايا لجميع الحاضرين
  const [giftQueue, setGiftQueue] = useState<GiftShowEvent[]>([]);
  const enqueueGift = useCallback(
    async (row: { id?: string; gift_id?: string; sender_id?: string; receiver_id?: string; quantity?: number }) => {
      if (!row.gift_id) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyDb = supabase as any;
      const [{ data: gift }, { data: names }] = await Promise.all([
        anyDb
          .from("gifts")
          .select(
            "id, name, image_url, thumb_url, animation_url, video_url, sound_url, sound_enabled, duration_ms, display_scale, rarity",
          )
          .eq("id", row.gift_id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", [row.sender_id, row.receiver_id].filter(Boolean) as string[]),
      ]);
      if (!gift) return;
      const nameOf = (id?: string) => (names ?? []).find((p) => p.id === id)?.display_name ?? "مستخدم";
      setGiftQueue((prev) => [
        ...prev,
        {
          key: row.id ?? `${row.gift_id}-${Date.now()}`,
          gift: gift as GiftMediaRow,
          senderName: nameOf(row.sender_id),
          receiverName: nameOf(row.receiver_id),
          quantity: row.quantity ?? 1,
        },
      ]);
    },
    [],
  );

  // realtime
  useEffect(() => {
    const channel = supabase
      .channel(`room-live-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_messages" }, () => void messages.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_mics" }, () => void mics.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, () => void members.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "mic_requests" }, () => void requests.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "gift_transactions" }, (payload) => {
        void messages.refetch();
        const row = payload.new as {
          id?: string;
          room_id?: string | null;
          gift_id?: string;
          sender_id?: string;
          receiver_id?: string;
          quantity?: number;
        } | null;
        if (payload.eventType === "INSERT" && row?.room_id === roomId) void enqueueGift(row);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const takeSeat = useMutation({
    mutationFn: async (seat: number) => {
      const { error } = await supabase.rpc("take_mic", { _room_id: roomId, _seat: seat });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("أنت الآن على المايك");
      void mics.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الصعود على المايك"),
  });

  const leaveSeat = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("room_mics")
        .update({ user_id: null })
        .eq("room_id", roomId)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => void mics.refetch(),
  });

  const requestMic = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("mic_requests").insert({ room_id: roomId, user_id: userId! });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم إرسال طلب المايك للمالك"),
    onError: () => toast.error("لديك طلب قائم بالفعل"),
  });

  const approveRequest = useMutation({
    mutationFn: async (request: { id: string; user_id: string }) => {
      const free = (mics.data ?? []).find((m) => !m.user_id && !m.is_locked);
      if (!free) throw new Error("لا يوجد مايك متاح");
      const { error } = await supabase.from("room_mics").update({ user_id: request.user_id }).eq("id", free.id);
      if (error) throw error;
      await supabase.from("mic_requests").delete().eq("id", request.id);
    },
    onSuccess: () => {
      toast.success("تمت الموافقة");
      void mics.refetch();
      void requests.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تنفيذ الطلب"),
  });

  const seatAction = useMutation({
    mutationFn: async ({ seat, patch }: { seat: MicSeat; patch: Partial<MicSeat> }) => {
      const { error } = await supabase.from("room_mics").update(patch).eq("id", seat.id);
      if (error) throw error;
    },
    onSuccess: () => void mics.refetch(),
    onError: () => toast.error("تعذر تنفيذ الإجراء"),
  });

  /** تعيين/إزالة مشرف الغرفة — لمالك الغرفة فقط (تتحقق قاعدة البيانات أيضًا). */
  const toggleModerator = useMutation({
    mutationFn: async ({ target, make }: { target: string; make: boolean }) => {
      if (make) {
        const { error } = await supabase.from("room_moderators").insert({ room_id: roomId, user_id: target });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("room_moderators")
          .delete()
          .eq("room_id", roomId)
          .eq("user_id", target);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.make ? "تم تعيينه مشرفًا للغرفة" : "تمت إزالة الإشراف");
      void moderators.refetch();
    },
    onError: () => toast.error("تعذر تغيير الإشراف"),
  });

  const kick = useMutation({
    mutationFn: async (target: string) => {
      await supabase.from("room_mics").update({ user_id: null }).eq("room_id", roomId).eq("user_id", target);
      const { error } = await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", target);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم طرد المستخدم");
      void members.refetch();
      void mics.refetch();
    },
  });

  const banUser = useMutation({
    mutationFn: async (target: string) => {
      const { error } = await supabase.from("bans").insert({
        user_id: target,
        room_id: roomId,
        scope: "room",
        reason: "حظر من مالك الغرفة",
        created_by: userId!,
      });
      if (error) throw error;
      await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", target);
      await supabase.from("room_mics").update({ user_id: null }).eq("room_id", roomId).eq("user_id", target);
    },
    onSuccess: () => {
      toast.success("تم حظر المستخدم من الغرفة");
      void members.refetch();
    },
    onError: () => toast.error("تعذر الحظر"),
  });

  async function sendMessage() {
    const body = text.trim();
    if (!body || !userId) return;
    if (room.data?.chat_locked && !canManage) {
      toast.error("الدردشة مغلقة");
      return;
    }
    setText("");
    const { error } = await supabase.rpc("send_room_message", { _room_id: roomId, _body: body });
    if (error) {
      toast.error("تعذر إرسال الرسالة");
      setText(body);
      return;
    }
    void messages.refetch();
  }

  const personOf = (id: string | null) => (id ? (people.data ?? []).find((p) => p.id === id) ?? null : null);

  const giftTargets: GiftTarget[] = (people.data ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    vip_level: p.vip_level,
    public_id: p.public_id,
  }));

  if (room.isLoading) return <AppShell hideNav>جارٍ تحميل الغرفة...</AppShell>;
  if (!room.data) return <AppShell hideNav>الغرفة غير موجودة.</AppShell>;

  return (
    <AppShell
      hideNav
      header={
        <header className="sticky top-0 z-30 bg-background/85 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void navigate({ to: "/rooms" })}
              className="p-1"
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{room.data.name}</p>
              <p className="text-[10px] text-muted-foreground">
                #{room.data.room_code} · {(members.data?.length ?? 0)} متواجد ·{" "}
                {voice.status === "connected"
                  ? "الصوت متصل"
                  : voice.status === "connecting"
                    ? "جارٍ الاتصال"
                    : voice.status === "reconnecting"
                      ? "إعادة الاتصال..."
                      : voice.status === "unconfigured"
                        ? "الصوت غير مُفعّل بعد"
                        : voice.status === "error"
                          ? "تعذر الاتصال بالصوت"
                          : "غير متصل"}
              </p>
            </div>
            <button onClick={() => setCupOpen(true)} className="p-1" aria-label="كأس الغرفة">
              <Trophy className="h-5 w-5" />
            </button>
            <button onClick={() => setDominoOpen(true)} className="p-1" aria-label="لعبة الدومينو">
              <LayoutGrid className="h-5 w-5" />
            </button>
            {canManage && (
              <>
                <button onClick={() => setRequestsOpen(true)} className="relative p-1" aria-label="طلبات المايك">
                  <Hand className="h-5 w-5" />
                  {(requests.data?.length ?? 0) > 0 && (
                    <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                      {requests.data?.length}
                    </span>
                  )}
                </button>
                <button onClick={() => setManageOpen(true)} className="p-1" aria-label="إدارة الغرفة">
                  <Settings className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          {voice.status === "unconfigured" && (
            <p className="mt-2 rounded-xl bg-surface p-2 text-[10px] text-muted-foreground">
              الصوت المباشر ينتظر مفاتيح خدمة الصوت من الإدارة — بقية الغرفة تعمل بشكل كامل.
            </p>
          )}
        </header>
      }
    >
      <RoomBackground url={room.data.background_url} />

      <div className="grid grid-cols-4 gap-3">
        {(mics.data ?? []).map((seat) => {
          const person = personOf(seat.user_id);
          const speaking = person ? voice.speakingIds.includes(person.id) : false;
          return (
            <button
              key={seat.id}
              onClick={() => {
                if (!person && !seat.is_locked && !canManage) {
                  takeSeat.mutate(seat.seat_index);
                  return;
                }
                setSeatSheet(seat.id);
              }}
              className="flex flex-col items-center gap-1"
            >
              <div
                className={cn(
                  "relative flex h-14 w-14 items-center justify-center rounded-full border",
                  speaking ? "border-success ring-2 ring-success/50" : "border-border",
                  "bg-surface",
                )}
              >
                {person ? (
                  <UserAvatar src={person.avatar_url} name={person.display_name} size={54} vipLevel={person.vip_level} frame={person.frame_url} />
                ) : seat.is_locked ? (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Mic className="h-5 w-5 text-muted-foreground" />
                )}
                {person && seat.is_muted && (
                  <span className="absolute -bottom-1 -end-1 rounded-full bg-destructive p-1">
                    <MicOff className="h-3 w-3 text-destructive-foreground" />
                  </span>
                )}
              </div>
              <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                {person?.display_name ?? `مايك ${seat.seat_index}`}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-5 space-y-2 pb-28">
        {(messages.data ?? []).map((m) => {
          const person = personOf(m.user_id);
          const isGift = m.kind === "gift";
          return (
            <div
              key={m.id}
              className={cn(
                "flex items-start gap-2 rounded-2xl p-2.5",
                isGift ? "gradient-rose text-primary-foreground" : "bg-surface",
              )}
            >
              <UserAvatar src={person?.avatar_url} name={person?.display_name} size={28} vipLevel={person?.vip_level ?? 0} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold">{person?.display_name ?? "مستخدم"}</p>
                <p className="break-words text-sm">{m.body}</p>
              </div>
            </div>
          );
        })}
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-border bg-background/95 p-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void sendMessage();
            }}
            placeholder={room.data.chat_locked && !canManage ? "الدردشة مغلقة" : "اكتب رسالة..."}
            disabled={room.data.chat_locked && !canManage}
            className="h-11 flex-1 rounded-2xl bg-surface text-sm"
          />
          <Button onClick={() => void sendMessage()} className="h-11 w-11 rounded-2xl gradient-gold p-0 text-primary-foreground">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              voice.toggleMic().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "تعذر تشغيل المايك"));
            }}
            className={cn("h-11 flex-1 rounded-2xl text-xs", voice.micEnabled && "border-success text-success")}
          >
            {voice.micEnabled ? <Mic className="me-1 h-4 w-4" /> : <MicOff className="me-1 h-4 w-4" />}
            {voice.micEnabled ? "المايك مفتوح" : "المايك مغلق"}
          </Button>
          <Button variant="outline" onClick={voice.toggleSpeaker} className="h-11 flex-1 rounded-2xl text-xs">
            {voice.speakerEnabled ? <Volume2 className="me-1 h-4 w-4" /> : <VolumeX className="me-1 h-4 w-4" />}
            {voice.speakerEnabled ? "السماعة" : "صامت"}
          </Button>
          {!mySeat && (
            <Button variant="outline" onClick={() => requestMic.mutate()} className="h-11 flex-1 rounded-2xl text-xs">
              <Hand className="me-1 h-4 w-4" /> طلب مايك
            </Button>
          )}
          <Button
            onClick={() => setGiftOpen(true)}
            className="h-11 flex-1 rounded-2xl gradient-rose text-xs font-bold text-primary-foreground"
          >
            <Gift className="me-1 h-4 w-4" /> هدية
          </Button>
        </div>
      </div>

      <GiftSheet
        key={giftTargetId ?? "all"}
        open={giftOpen}
        onOpenChange={(v) => {
          setGiftOpen(v);
          if (!v) setGiftTargetId(null);
        }}
        roomId={roomId}
        targets={giftTargets}
        {...(giftTargetId ? { initialReceiverId: giftTargetId } : {})}
      />

      {/* لوحة التحكم بالمايك: تظهر لصاحب الغرفة والمشرفين عند الضغط على أي مايك */}
      <Sheet open={Boolean(seatSheet)} onOpenChange={(v) => !v && setSeatSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {(() => {
            const seat = (mics.data ?? []).find((m) => m.id === seatSheet) ?? null;
            if (!seat) return null;
            const person = personOf(seat.user_id);
            const isMe = person?.id === userId;
            const isMod = person ? (moderators.data ?? []).includes(person.id) : false;
            const close = () => setSeatSheet(null);
            return (
              <>
                <SheetHeader>
                  <SheetTitle>
                    مايك {seat.seat_index} · {person?.display_name ?? "فارغ"}
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4 grid grid-cols-2 gap-2 pb-4">
                  {!person && !seat.is_locked && (
                    <SeatBtn
                      label="اصعد على المايك"
                      onClick={() => {
                        takeSeat.mutate(seat.seat_index);
                        close();
                      }}
                    />
                  )}
                  {person && isMe && (
                    <SeatBtn
                      label="انزل من المايك"
                      onClick={() => {
                        leaveSeat.mutate();
                        close();
                      }}
                    />
                  )}
                  {person && !isMe && (
                    <>
                      <SeatBtn
                        label="عرض الملف الشخصي"
                        onClick={() => {
                          close();
                          void navigate({ to: "/u/$publicId", params: { publicId: person.public_id } });
                        }}
                      />
                      <SeatBtn
                        label="إرسال هدية"
                        onClick={() => {
                          setGiftTargetId(person.id);
                          setGiftOpen(true);
                          close();
                        }}
                      />
                    </>
                  )}
                  {canManage && person && !isMe && (
                    <>
                      <SeatBtn
                        label={seat.is_muted ? "إلغاء الكتم" : "كتم المايك"}
                        onClick={() => {
                          seatAction.mutate({ seat, patch: { is_muted: !seat.is_muted } });
                          close();
                        }}
                      />
                      <SeatBtn
                        label="تنزيل من المايك"
                        onClick={() => {
                          seatAction.mutate({ seat, patch: { user_id: null, is_muted: false } });
                          close();
                        }}
                      />
                      <SeatBtn
                        label="طرد من الغرفة"
                        tone="warn"
                        onClick={() => {
                          kick.mutate(person.id);
                          close();
                        }}
                      />
                      <SeatBtn
                        label="حظر من الغرفة"
                        tone="danger"
                        onClick={() => {
                          banUser.mutate(person.id);
                          close();
                        }}
                      />
                    </>
                  )}
                  {isOwner && person && !isMe && (
                    <SeatBtn
                      label={isMod ? "إزالة إشراف الغرفة" : "تعيين مشرف للغرفة"}
                      onClick={() => {
                        toggleModerator.mutate({ target: person.id, make: !isMod });
                        close();
                      }}
                    />
                  )}
                  {canManage && (
                    <SeatBtn
                      label={seat.is_locked ? "فتح المايك" : "قفل المايك"}
                      onClick={() => {
                        seatAction.mutate({ seat, patch: { is_locked: !seat.is_locked } });
                        close();
                      }}
                    />
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
      <GiftOverlay event={giftQueue[0] ?? null} onDone={() => setGiftQueue((prev) => prev.slice(1))} />

      <Sheet open={dominoOpen} onOpenChange={setDominoOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>ألعاب الغرفة</SheetTitle>
          </SheetHeader>
          <div className="mb-3 flex gap-2 rounded-2xl bg-surface-2 p-1">
            {(
              [
                { key: "wheel" as const, label: "🎡 عجلة الحظ" },
                { key: "domino" as const, label: "🁣 دومينو" },
              ]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setRoomGame(t.key)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                  roomGame === t.key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pb-6">
            {roomGame === "wheel" ? <LiveWheel roomId={roomId} /> : <DominoGame roomId={roomId} />}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={requestsOpen} onOpenChange={setRequestsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>طلبات المايك</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-6">
            {(requests.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد طلبات.</p>
            ) : (
              requests.data?.map((r) => {
                const person = personOf(r.user_id);
                return (
                  <div key={r.id} className="surface-card flex items-center gap-3 p-3">
                    <UserAvatar src={person?.avatar_url} name={person?.display_name} size={40} />
                    <p className="flex-1 text-sm font-semibold">{person?.display_name ?? "مستخدم"}</p>
                    <Button
                      onClick={() => approveRequest.mutate({ id: r.id, user_id: r.user_id })}
                      className="h-9 w-9 rounded-xl gradient-gold p-0 text-primary-foreground"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void supabase.from("mic_requests").delete().eq("id", r.id).then(() => requests.refetch())}
                      className="h-9 w-9 rounded-xl p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>إدارة الغرفة</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pb-6">
            <Button
              variant="outline"
              onClick={async () => {
                const { error } = await supabase
                  .from("rooms")
                  .update({ chat_locked: !room.data!.chat_locked })
                  .eq("id", roomId);
                if (error) toast.error("تعذر التعديل");
                else {
                  toast.success(room.data!.chat_locked ? "تم فتح الدردشة" : "تم إغلاق الدردشة");
                  void room.refetch();
                }
              }}
              className="h-12 w-full rounded-2xl"
            >
              {room.data.chat_locked ? "فتح الدردشة" : "إغلاق الدردشة"}
            </Button>

            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">المتواجدون</p>
              <div className="space-y-2">
                {(people.data ?? []).map((p) => (
                  <div key={p.id} className="surface-card flex items-center gap-3 p-3">
                    <UserAvatar src={p.avatar_url} name={p.display_name} size={40} vipLevel={p.vip_level} frame={p.frame_url} />
                    <p className="flex-1 truncate text-sm font-semibold">{p.display_name}</p>
                    {p.id !== userId && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => kick.mutate(p.id)}
                          className="h-9 rounded-xl px-3 text-[11px]"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => banUser.mutate(p.id)}
                          className="h-9 rounded-xl border-destructive/40 px-3 text-[11px] text-destructive"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">المايكات</p>
              <div className="grid grid-cols-2 gap-2">
                {(mics.data ?? []).map((seat) => (
                  <Button
                    key={seat.id}
                    variant="outline"
                    onClick={() => seatAction.mutate({ seat, patch: { is_locked: !seat.is_locked } })}
                    className="h-11 rounded-2xl text-[11px]"
                  >
                    مايك {seat.seat_index}: {seat.is_locked ? "مغلق" : "مفتوح"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function RoomBackground({ url }: { url: string | null }) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(url).then((next) => {
      if (active) setResolved(next);
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (!resolved) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <img src={resolved} alt="" className="h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
}

/** زر إجراء داخل لوحة التحكم بالمايك. */
function SeatBtn({
  label,
  onClick,
  tone = "normal",
}: {
  label: string;
  onClick: () => void;
  tone?: "normal" | "warn" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 rounded-2xl border text-xs font-semibold transition-colors active:scale-[0.98]",
        tone === "danger"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : tone === "warn"
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-surface",
      )}
    >
      {label}
    </button>
  );
}
