import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { toast } from "sonner";
import {
  ArrowRight,
  Ban,
  Check,
  Gift,
  Hand,
  FerrisWheel,
  LayoutGrid,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Music,
  Camera,
  Send,
  Settings,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { GiftSheet, type GiftTarget } from "@/components/GiftSheet";
import { LuckyBagSheet, LuckyBagStrip } from "@/components/LuckyBag";
import { GiftOverlay, type GiftMediaRow, type GiftShowEvent } from "@/components/GiftMedia";
import { RoomSupporters } from "@/components/RoomSupporters";
import { RoomCosmetics, CosmeticImage } from "@/components/RoomCosmetics";
import { DominoGame } from "@/components/DominoGame";
import { Game77 } from "@/components/Game77";
import { SuperCarGame } from "@/components/SuperCarGame";
import { formatCompact } from "@/lib/format";
import { LiveWheel } from "@/components/LiveWheel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMyProfile, useSupabaseSession } from "@/hooks/use-session";
import { useVoiceRoomContext } from "@/components/VoiceRoomProvider";
import { BadgeStrip } from "@/components/BadgeStrip";
import {
  closeWheelRound,
  getMyRoomBadgePermissions,
  removeRoomParticipant,
  updateOwnedRoomDetails,
} from "@/lib/rooms.functions";
import { uploadUserImage } from "@/lib/media";
import { cn } from "@/lib/utils";
import roomAuroraBackground from "@/assets/room-aurora-bg.jpg";
import { VipName } from "@/components/VipName";
import { VipCvipSheet } from "@/components/VipCvipSheet";
import { RoomPanels } from "@/components/RoomPanels";
import { RolePanel } from "@/components/RolePanel";
import { RoomTreasureFloat } from "@/components/RoomTreasureFloat";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "غرفة صوتية — التاج" },
      {
        name: "description",
        content: "غرفة صوتية مباشرة: مايكات، دردشة نصية، هدايا وإدارة كاملة للمالك والمشرفين.",
      },
      { property: "og:title", content: "غرفة صوتية — التاج" },
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
  decoration_url: string | null;
};

type Person = {
  id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  frame_url: string | null;
  vip_level: number;
  level: number;
  mic_decoration_url: string | null;
};

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function RoomPage() {
  const { roomId } = Route.useParams();
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();

  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [dominoOpen, setDominoOpen] = useState(false);
  const [roomGame, setRoomGame] = useState<"wheel" | "seven77" | "supercar" | "domino">("wheel");
  const [roomBet77, setRoomBet77] = useState(10_000_000);
  const [seatSheet, setSeatSheet] = useState<string | null>(null);
  const [roleSheet, setRoleSheet] = useState<string | null>(null);
  const [cupOpen, setCupOpen] = useState(false);
  const [cosmeticsOpen, setCosmeticsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);
  const [luckyOpen, setLuckyOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomPanelsOpen, setRoomPanelsOpen] = useState(false);
  const [roomPanelsTab, setRoomPanelsTab] = useState<
    "info" | "members" | "activities" | "treasure" | "rewards"
  >("info");
  const [giftFxEnabled, setGiftFxEnabled] = useState(true);
  const giftFxRef = useRef(true);
  useEffect(() => {
    const saved =
      typeof window === "undefined" ? null : window.localStorage.getItem("sawtak-gift-fx");
    const on = saved !== "off";
    setGiftFxEnabled(on);
    giftFxRef.current = on;
  }, []);
  const setGiftFx = (on: boolean) => {
    setGiftFxEnabled(on);
    giftFxRef.current = on;
    if (!on) setGiftQueue([]);
    if (typeof window !== "undefined")
      window.localStorage.setItem("sawtak-gift-fx", on ? "on" : "off");
  };
  const myProfile = useMyProfile(userId);
  const musicRef = useRef<HTMLInputElement>(null);
  const roomImageRef = useRef<HTMLInputElement>(null);
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomImageFile, setRoomImageFile] = useState<File | null>(null);
  const [roomImagePreview, setRoomImagePreview] = useState<string | null>(null);
  const [giftTargetId, setGiftTargetId] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(userId ? 1 : 0);
  const [sendingMessage, setSendingMessage] = useState(false);

  const room = useQuery({
    queryKey: ["room", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select(
          "id, room_code, name, image_url, background_url, theme, owner_id, is_active, is_disabled, chat_locked",
        )
        .eq("id", roomId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const mics = useQuery({
    queryKey: ["room-mics", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_mics")
        .select("id, seat_index, user_id, is_locked, is_muted, decoration_url")
        .eq("room_id", roomId)
        .order("seat_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MicSeat[];
    },
  });

  const members = useQuery({
    queryKey: ["room-members", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", roomId);
      if (error) throw error;
      return (data ?? []).map((m) => m.user_id);
    },
  });

  const seatUserIds = useMemo(
    () => (mics.data ?? []).map((m) => m.user_id).filter((v): v is string => Boolean(v)),
    [mics.data],
  );

  const couples = useQuery({
    queryKey: ["room-couples", roomId, seatUserIds.join(",")],
    enabled: seatUserIds.length > 1,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_couples", { _room_id: roomId });
      if (error) throw error;
      return (data ?? []) as { user_a: string; user_b: string; type: string }[];
    },
  });

  const coupleKeys = useMemo(
    () => new Set((couples.data ?? []).map((c) => pairKey(c.user_a, c.user_b))),
    [couples.data],
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
        .select(
          "id, public_id, display_name, avatar_url, frame_url, vip_level, level, mic_decoration_url",
        )
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
      const { data, error } = await supabase
        .from("room_moderators")
        .select("user_id")
        .eq("room_id", roomId);
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
  const badgePermissions = useQuery({
    queryKey: ["my-room-badge-permissions", userId],
    enabled: Boolean(userId),
    queryFn: () => getMyRoomBadgePermissions(),
  });
  const canRemoveParticipants = isOwner || Boolean(badgePermissions.data?.participantRemove);
  const canManage =
    isOwner || (moderators.data ?? []).includes(userId ?? "") || canRemoveParticipants;
  const mySeat = (mics.data ?? []).find((m) => m.user_id === userId) ?? null;
  const { voice, activeRoom, enterRoom, minimizeRoom, exitRoom, minimized } = useVoiceRoomContext();
  const canPublish = Boolean(mySeat && !mySeat.is_muted);
  const minimizedRef = useRef(false);
  minimizedRef.current = minimized;

  useEffect(() => {
    if (!room.data || room.data.is_disabled || !room.data.is_active) {
      if (activeRoom?.id === roomId) exitRoom();
      return;
    }
    enterRoom({ id: roomId, name: room.data.name, imageUrl: room.data.image_url }, canPublish);
  }, [activeRoom?.id, canPublish, enterRoom, exitRoom, roomId, room.data]);

  // join / leave membership
  useEffect(() => {
    if (!userId) return;
    void supabase
      .from("room_members")
      .upsert(
        { room_id: roomId, user_id: userId, joined_at: new Date().toISOString() },
        { onConflict: "room_id,user_id" },
      );
    return () => {
      if (minimizedRef.current) return; // الغرفة مصغّرة — نُبقي العضوية والمايك
      void supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
      void supabase
        .from("room_mics")
        .update({ user_id: null })
        .eq("room_id", roomId)
        .eq("user_id", userId);
    };
  }, [roomId, userId]);

  // طبقة عرض تأثيرات الهدايا لجميع الحاضرين
  const [giftQueue, setGiftQueue] = useState<GiftShowEvent[]>([]);
  const enqueueGift = useCallback(
    async (row: {
      id?: string;
      gift_id?: string;
      sender_id?: string;
      receiver_id?: string;
      quantity?: number;
    }) => {
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
      const nameOf = (id?: string) =>
        (names ?? []).find((p) => p.id === id)?.display_name ?? "مستخدم";
      setGiftQueue((prev) => [
        ...prev.slice(-7),
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
      .channel(`room-live-${roomId}`, {
        config: { presence: { key: userId ?? crypto.randomUUID() } },
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        () => void messages.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_mics", filter: `room_id=eq.${roomId}` },
        () => void mics.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` },
        () => void members.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mic_requests", filter: `room_id=eq.${roomId}` },
        () => void requests.refetch(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gift_transactions",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          void messages.refetch();
          const row = payload.new as {
            id?: string;
            room_id?: string | null;
            gift_id?: string;
            sender_id?: string;
            receiver_id?: string;
            quantity?: number;
          } | null;
          if (payload.eventType === "INSERT" && row?.room_id === roomId && giftFxRef.current)
            void enqueueGift(row);
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setLiveCount(Math.max(userId ? 1 : 0, Object.keys(state).length));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && userId) {
          void channel.track({ user_id: userId, joined_at: new Date().toISOString() });
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  const takeSeat = useMutation({
    mutationFn: async (seat: number) => {
      const { error } = await supabase.rpc("take_mic", { _room_id: roomId, _seat: seat });
      if (error) throw error;
    },
    onSuccess: () => {
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
      const { error } = await supabase
        .from("mic_requests")
        .insert({ room_id: roomId, user_id: userId! });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم إرسال طلب المايك للمالك"),
    onError: () => toast.error("لديك طلب قائم بالفعل"),
  });

  const approveRequest = useMutation({
    mutationFn: async (request: { id: string; user_id: string }) => {
      const free = (mics.data ?? []).find((m) => !m.user_id && !m.is_locked);
      if (!free) throw new Error("لا يوجد مايك متاح");
      const { error } = await supabase
        .from("room_mics")
        .update({ user_id: request.user_id })
        .eq("id", free.id);
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
        const { error } = await supabase
          .from("room_moderators")
          .insert({ room_id: roomId, user_id: target });
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
      await removeRoomParticipant({ data: { roomId, targetId: target } });
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
      await supabase
        .from("room_mics")
        .update({ user_id: null })
        .eq("room_id", roomId)
        .eq("user_id", target);
    },
    onSuccess: () => {
      toast.success("تم حظر المستخدم من الغرفة");
      void members.refetch();
    },
    onError: () => toast.error("تعذر الحظر"),
  });

  const updateRoomDetails = useMutation({
    mutationFn: async () => {
      const name = roomNameDraft.trim();
      if (name.length < 2) throw new Error("اكتب اسمًا من حرفين على الأقل");
      let imageUrl = room.data?.image_url ?? null;
      if (roomImageFile && userId) imageUrl = await uploadUserImage("rooms", userId, roomImageFile);
      return updateOwnedRoomDetails({ data: { roomId, name, imageUrl } });
    },
    onSuccess: () => {
      toast.success("تم تحديث اسم الغرفة وصورتها");
      setRoomImageFile(null);
      setRoomImagePreview(null);
      void room.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تعديل الغرفة"),
  });

  async function sendMessage() {
    const body = text.trim();
    if (!body || !userId || sendingMessage) return;
    if (room.data?.chat_locked && !canManage) {
      toast.error("الدردشة مغلقة");
      return;
    }
    setSendingMessage(true);
    try {
      const { error: membershipError } = await supabase
        .from("room_members")
        .upsert(
          { room_id: roomId, user_id: userId, joined_at: new Date().toISOString() },
          { onConflict: "room_id,user_id" },
        );
      if (membershipError) throw membershipError;

      const { error } = await supabase.rpc("send_room_message", { _room_id: roomId, _body: body });
      if (error) throw error;
      setText("");
      await messages.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إرسال الرسالة");
    } finally {
      setSendingMessage(false);
    }
  }

  const personOf = (id: string | null) =>
    id ? ((people.data ?? []).find((p) => p.id === id) ?? null) : null;

  const giftTargets: GiftTarget[] = (people.data ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    avatar_url: p.avatar_url,
    vip_level: p.vip_level,
    public_id: p.public_id,
  }));

  if (room.isLoading) return <AppShell hideNav>جارٍ تحميل الغرفة...</AppShell>;
  if (!room.data || room.data.is_disabled || !room.data.is_active)
    return <AppShell hideNav>الغرفة غير متاحة.</AppShell>;

  return (
    <AppShell
      hideNav
      fullBleed
      header={
        <header className="fixed inset-x-0 top-0 z-40 mx-auto max-w-lg px-3 pb-3 pt-3 text-foreground">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-border/50 bg-background/65 p-2 backdrop-blur-xl">
            <button
              onClick={() => setLeaveOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface/80"
              aria-label="تصغير أو خروج"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-black">{room.data.name}</p>
              <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground">
                <span>ID: {room.data.room_code}</span>
                <span>•</span>
                <span>
                  {Math.max(liveCount, members.data?.includes(userId ?? "") ? 1 : 0)} متواجد
                </span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    voice.status === "connected" ? "bg-success" : "bg-destructive",
                  )}
                />
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => setCupOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15"
                aria-label="كأس الغرفة"
              >
                <Trophy className="h-4 w-4 text-primary" />
              </button>
              <button
                onClick={() => setCosmeticsOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-surface/80"
                aria-label="تزيين الغرفة"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              {canManage && (
                <button
                  onClick={() => {
                    setRoomNameDraft(room.data?.name ?? "");
                    setRoomImageFile(null);
                    setRoomImagePreview(null);
                    setManageOpen(true);
                  }}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-surface/80"
                  aria-label="إدارة الغرفة"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="mt-1 flex justify-between px-1">
            <BadgeStrip userId={userId} rank="عضو" count={0} />
            {canManage && (requests.data?.length ?? 0) > 0 && (
              <button
                onClick={() => setRequestsOpen(true)}
                className="rounded-full bg-accent px-2 py-1 text-[9px] font-bold text-accent-foreground"
              >
                {requests.data?.length} طلب مايك
              </button>
            )}
          </div>
        </header>
      }
    >
      <div className="room-immersive fixed inset-0 -z-10 mx-auto max-w-lg overflow-hidden">
        <img
          src={roomAuroraBackground}
          width={768}
          height={1536}
          alt="خلفية شفق قطبي للغرفة"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-background/20" />
      </div>
      {room.data.background_url && <RoomBackground url={room.data.background_url} />}

      {room.data.theme && (
        <CosmeticImage
          url={room.data.theme}
          className="pointer-events-none mx-auto mb-1 max-h-16 w-full object-contain"
        />
      )}

      {(voice.status === "reconnecting" ||
        voice.status === "error" ||
        voice.status === "unconfigured") && (
        <div className="fixed inset-x-3 top-24 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-accent/40 bg-background/95 p-2.5 shadow-xl backdrop-blur-xl">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
          <p className="min-w-0 flex-1 text-[10px] font-bold">
            {voice.status === "reconnecting"
              ? "جارٍ إعادة اتصال الصوت…"
              : voice.error || "الخدمة الصوتية غير متاحة حاليًا"}
          </p>
          {voice.status !== "reconnecting" && (
            <button
              type="button"
              onClick={voice.retry}
              className="rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-black text-primary-foreground"
            >
              إعادة المحاولة
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-3 pt-28 sm:px-5">
        {(mics.data ?? []).map((seat, idx) => {
          const person = personOf(seat.user_id);
          const speaking = person ? voice.speakingIds.includes(person.id) : false;
          const list = mics.data ?? [];
          const next = list[idx + 1];
          const sameRow = (idx + 1) % 4 !== 0;
          const linkedNext =
            sameRow && seat.user_id && next?.user_id
              ? coupleKeys.has(pairKey(seat.user_id, next.user_id))
              : false;
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
              className="relative flex min-w-0 flex-col items-center gap-1.5"
            >
              {linkedNext && (
                <span className="pointer-events-none absolute -start-2 top-4 z-20 text-base drop-shadow-[0_0_6px_rgba(244,63,94,0.9)]">
                  ❤️
                </span>
              )}
              <div
                className={cn(
                  "relative flex h-14 w-14 items-center justify-center rounded-full border sm:h-16 sm:w-16",
                  speaking ? "border-success ring-2 ring-success/50" : "border-border",
                  person?.id === room.data!.owner_id
                    ? "border-primary bg-primary/10 shadow-glow"
                    : "bg-surface",
                )}
              >
                {person ? (
                  <UserAvatar
                    src={person.avatar_url}
                    name={person.display_name}
                    size={54}
                    vipLevel={person.vip_level}
                    frame={person.frame_url}
                  />
                ) : seat.is_locked ? (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Mic className="h-5 w-5 text-muted-foreground" />
                )}
                {(person?.mic_decoration_url ?? seat.decoration_url) && (
                  <CosmeticImage
                    url={person?.mic_decoration_url ?? seat.decoration_url}
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[170%] w-[170%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
                  />
                )}
                {person && seat.is_muted && (
                  <span className="absolute -bottom-1 -end-1 rounded-full bg-destructive p-1">
                    <MicOff className="h-3 w-3 text-destructive-foreground" />
                  </span>
                )}
                {person?.id === room.data!.owner_id && (
                  <span className="absolute -top-2 rounded-full bg-primary p-1 text-primary-foreground shadow-lg">
                    <Crown className="h-3 w-3" />
                  </span>
                )}
              </div>
              {person ? (
                <VipName
                  name={person.display_name}
                  vipLevel={person.vip_level}
                  className="w-full truncate text-center text-[9px]"
                />
              ) : (
                <span className="w-full truncate text-center text-[9px] text-foreground/75">
                  NO.{seat.seat_index}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="mx-3 mt-5 space-y-2 pb-64">
        {(messages.data ?? []).map((m) => {
          const person = personOf(m.user_id);
          const isGift = m.kind === "gift";
          return (
            <div
              key={m.id}
              className={cn(
                "flex items-start gap-2 rounded-xl border border-border/30 p-2.5 backdrop-blur-md",
                isGift ? "gradient-rose text-primary-foreground" : "bg-background/45",
              )}
            >
              <button
                type="button"
                onClick={() => person && setRoleSheet(person.id)}
                aria-label="عرض المنصب"
              >
                <UserAvatar
                  src={person?.avatar_url}
                  name={person?.display_name}
                  size={28}
                  vipLevel={person?.vip_level ?? 0}
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold">{person?.display_name ?? "مستخدم"}</p>
                <p className="break-words text-sm">{m.body}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* أزرار الجانب الأيسر: الكنز وصالة VIP والألعاب والموسيقى — كما في التصميم المرجعي */}
      <div className="pointer-events-none fixed bottom-48 start-2 z-40 flex flex-col items-center gap-2">
        <RoomTreasureFloat
          roomId={roomId}
          onOpen={() => {
            setRoomPanelsTab("treasure");
            setRoomPanelsOpen(true);
          }}
        />
        <div className="pointer-events-auto flex flex-col gap-2">
          <RoomUtility label="صالة VIP" onClick={() => setVipOpen(true)}>
            <Crown className="h-5 w-5" />
          </RoomUtility>
          <RoomUtility
            label="الألعاب"
            onClick={() => {
              setRoomGame("wheel");
              setDominoOpen(true);
            }}
          >
            <FerrisWheel className="h-5 w-5" />
          </RoomUtility>
          <RoomUtility
            label={voice.musicPlaying ? "إيقاف الموسيقى" : "الموسيقى"}
            active={voice.musicPlaying}
            onClick={() => {
              if (!mySeat) {
                toast.error("اصعد على المايك أولًا لتشغيل الموسيقى");
                return;
              }
              if (voice.musicPlaying) voice.stopMusic();
              else musicRef.current?.click();
            }}
          >
            <Music className="h-5 w-5" />
          </RoomUtility>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-3xl border border-b-0 border-border/50 bg-background/90 px-2.5 pb-[max(.65rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur-xl">
        {/* صندوق الحظ يظهر لجميع الحاضرين */}
        <div className="mb-2">
          <LuckyBagStrip roomId={roomId} />
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void sendMessage();
            }}
            placeholder={room.data.chat_locked && !canManage ? "الدردشة مغلقة" : "اكتب رسالة..."}
            disabled={room.data.chat_locked && !canManage}
            className="h-11 flex-1 rounded-full border-border/50 bg-surface/70 text-sm"
          />
          <Button
            disabled={sendingMessage || !text.trim()}
            onClick={() => void sendMessage()}
            aria-label="إرسال الرسالة"
            className="h-11 w-11 rounded-full gradient-gold p-0 text-primary-foreground"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          <RoundControl
            label={voice.micEnabled ? "المايك مفتوح" : "المايك مغلق"}
            active={voice.micEnabled}
            onClick={() => {
              voice
                .toggleMic()
                .catch((e: unknown) =>
                  toast.error(e instanceof Error ? e.message : "تعذر تشغيل المايك"),
                );
            }}
          >
            {voice.micEnabled ? (
              <Mic className="h-4.5 w-4.5" />
            ) : (
              <MicOff className="h-4.5 w-4.5" />
            )}
          </RoundControl>
          <RoundControl
            label={voice.speakerEnabled ? "السماعة" : "صامت"}
            active={voice.speakerEnabled}
            onClick={voice.toggleSpeaker}
          >
            {voice.speakerEnabled ? (
              <Volume2 className="h-4.5 w-4.5" />
            ) : (
              <VolumeX className="h-4.5 w-4.5" />
            )}
          </RoundControl>
          {!mySeat && (
            <RoundControl label="طلب مايك" onClick={() => requestMic.mutate()}>
              <Hand className="h-4.5 w-4.5" />
            </RoundControl>
          )}
          <RoundControl label="حقيبة الحظ" onClick={() => setLuckyOpen(true)}>
            <span className="text-base leading-none">🧧</span>
          </RoundControl>
          <RoundControl label="هدية" tone="gift" onClick={() => setGiftOpen(true)}>
            <Gift className="h-4.5 w-4.5" />
          </RoundControl>
          <RoundControl label="إعدادات الغرفة" onClick={() => setRoomSettingsOpen(true)}>
            <Settings className="h-4.5 w-4.5" />
          </RoundControl>
        </div>
        <input
          ref={musicRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            voice
              .playMusic(f)
              .then(() => toast.success("جارٍ تشغيل الأغنية للجميع"))
              .catch((err: unknown) =>
                toast.error(err instanceof Error ? err.message : "تعذر تشغيل الأغنية"),
              );
          }}
        />
      </div>

      {/* تصغير الغرفة أو الخروج منها */}
      <Sheet open={leaveOpen} onOpenChange={setLeaveOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-start">الغرفة</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2 pb-4">
            <Button
              onClick={() => {
                minimizeRoom();
                setLeaveOpen(false);
                void navigate({ to: "/home" });
              }}
              className="h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
            >
              تصغير الغرفة (تبقى على المايك)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  minimizedRef.current = false;
                  if (userId) {
                    // الخروج النهائي: إنزال الحساب من المايك وإزالة العضوية فورًا
                    await supabase
                      .from("room_mics")
                      .update({ user_id: null, is_muted: false })
                      .eq("room_id", roomId)
                      .eq("user_id", userId);
                    await supabase
                      .from("mic_requests")
                      .delete()
                      .eq("room_id", roomId)
                      .eq("user_id", userId);
                    await supabase
                      .from("room_members")
                      .delete()
                      .eq("room_id", roomId)
                      .eq("user_id", userId);
                  }
                  exitRoom();
                  setLeaveOpen(false);
                  void navigate({ to: "/home" });
                })();
              }}
              className="h-12 w-full rounded-2xl border-destructive/40 text-destructive"
            >
              خروج من الغرفة
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* إعدادات الغرفة للجميع: إيقاف تأثير الهدايا */}
      <Sheet open={roomSettingsOpen} onOpenChange={setRoomSettingsOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-start">إعدادات الغرفة</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-3 pb-4">
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setRoomSettingsOpen(false);
                  setRoomPanelsTab("info");
                  setRoomPanelsOpen(true);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 p-4 text-start"
              >
                <span className="text-sm font-bold text-primary">لوحة الغرفة</span>
                <span className="text-[11px] text-muted-foreground">
                  المعلومات · الأعضاء · النشاطات · صندوق الكنز · الجوائز
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setGiftFx(!giftFxEnabled)}
              className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface/70 p-4 text-start"
            >
              <span className="text-sm font-bold">تأثيرات الهدايا</span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold",
                  giftFxEnabled
                    ? "bg-success/20 text-success"
                    : "bg-destructive/20 text-destructive",
                )}
              >
                {giftFxEnabled ? "مفعّلة" : "موقوفة"}
              </span>
            </button>
            <p className="text-[11px] text-muted-foreground">
              إيقاف التأثيرات يخفي الفيديو والصوت لكل الهدايا داخل الغرف ويجعل التطبيق أسرع —
              الإعداد خاص بك فقط.
            </p>
            <button
              type="button"
              onClick={voice.toggleSpeaker}
              className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface/70 p-4 text-start"
            >
              <span className="text-sm font-bold">الاستماع للغرفة</span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold",
                  voice.speakerEnabled
                    ? "bg-success/20 text-success"
                    : "bg-destructive/20 text-destructive",
                )}
              >
                {voice.speakerEnabled ? "مفتوح" : "مغلق"}
              </span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <RoomPanels
        roomId={roomId}
        userId={userId}
        isOwner={isOwner}
        canManage={isOwner || (moderators.data ?? []).includes(userId ?? "")}
        open={roomPanelsOpen}
        onOpenChange={setRoomPanelsOpen}
        initialTab={roomPanelsTab}
      />

      <RoomCosmetics
        roomId={roomId}
        userId={userId}
        isOwner={isOwner}
        canCustomize={Boolean(badgePermissions.data?.roomBackground)}
        open={cosmeticsOpen}
        onOpenChange={setCosmeticsOpen}
        onApplied={() => {
          void room.refetch();
          void mics.refetch();
          setCosmeticsOpen(false);
        }}
      />

      <VipCvipSheet
        open={vipOpen}
        onOpenChange={setVipOpen}
        mode="vip"
        currentVip={myProfile.data?.vip_level ?? 0}
        isCvip={Boolean(myProfile.data?.is_cvip)}
      />

      <RoomSupporters roomId={roomId} open={cupOpen} onOpenChange={setCupOpen} />

      <LuckyBagSheet roomId={roomId} open={luckyOpen} onOpenChange={setLuckyOpen} />

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
                {person && (
                  <RolePanel
                    userId={person.id}
                    isRoomOwner={person.id === room.data!.owner_id}
                    isRoomModerator={isMod}
                    onNavigate={close}
                    className="mt-3"
                  />
                )}
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
                          void navigate({
                            to: "/u/$publicId",
                            params: { publicId: person.public_id },
                          });
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
      <Sheet open={Boolean(roleSheet)} onOpenChange={(v) => !v && setRoleSheet(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-start">
              {personOf(roleSheet)?.display_name ?? "المنصب"}
            </SheetTitle>
          </SheetHeader>
          {roleSheet && (
            <RolePanel
              userId={roleSheet}
              isRoomOwner={roleSheet === room.data?.owner_id}
              isRoomModerator={(moderators.data ?? []).includes(roleSheet)}
              onNavigate={() => setRoleSheet(null)}
              className="mb-4 mt-3"
            />
          )}
        </SheetContent>
      </Sheet>

      <GiftOverlay
        event={giftQueue[0] ?? null}
        onDone={() => setGiftQueue((prev) => prev.slice(1))}
      />

      <Sheet open={dominoOpen} onOpenChange={setDominoOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>ألعاب الغرفة</SheetTitle>
          </SheetHeader>
          <div className="mb-3 flex gap-2 rounded-2xl bg-surface-2 p-1">
            {[
              { key: "wheel" as const, label: "🎡 عجلة الحظ" },
              { key: "seven77" as const, label: "7️⃣ لعبة 77" },
              { key: "supercar" as const, label: "🏎️ سباق السيارات" },
              { key: "domino" as const, label: "🁣 دومينو" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setRoomGame(t.key)}
                className={cn(
                  "flex-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-colors",
                  roomGame === t.key
                    ? "gradient-gold text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pb-6">
            {roomGame === "wheel" && badgePermissions.data?.wheelClose && (
              <Button
                variant="outline"
                onClick={() =>
                  void closeWheelRound({ data: { roomId } })
                    .then(() => toast.success("تم إغلاق الجولة وتسوية النتيجة"))
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : "تعذر إغلاق الجولة"),
                    )
                }
                className="mb-3 h-10 w-full rounded-xl"
              >
                إغلاق الجولة الآن
              </Button>
            )}
            {roomGame === "wheel" ? (
              <LiveWheel roomId={roomId} />
            ) : roomGame === "seven77" ? (
              <div>
                <div className="mb-3 flex gap-2">
                  {[10_000_000, 50_000_000, 100_000_000, 200_000_000].map((b) => (
                    <button
                      key={b}
                      onClick={() => setRoomBet77(b)}
                      className={cn(
                        "flex-1 rounded-xl border px-2 py-2 text-[11px] font-bold",
                        roomBet77 === b
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {formatCompact(b)}
                    </button>
                  ))}
                </div>
                <Game77 bet={roomBet77} />
              </div>
            ) : roomGame === "supercar" ? (
              <SuperCarGame roomId={roomId} />
            ) : (
              <DominoGame roomId={roomId} />
            )}
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
                    <p className="flex-1 text-sm font-semibold">
                      {person?.display_name ?? "مستخدم"}
                    </p>
                    <Button
                      onClick={() => approveRequest.mutate({ id: r.id, user_id: r.user_id })}
                      className="h-9 w-9 rounded-xl gradient-gold p-0 text-primary-foreground"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void supabase
                          .from("mic_requests")
                          .delete()
                          .eq("id", r.id)
                          .then(() => requests.refetch())
                      }
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
            {isOwner && (
              <section className="space-y-3 border-b border-border pb-4">
                <p className="text-xs font-bold text-muted-foreground">بيانات الغرفة</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => roomImageRef.current?.click()}
                    className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface"
                    aria-label="تغيير صورة الغرفة"
                  >
                    {roomImagePreview || room.data.image_url ? (
                      <RoomImagePreview stored={roomImagePreview ?? room.data.image_url} />
                    ) : (
                      <Camera className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <Input
                    value={roomNameDraft}
                    onChange={(event) => setRoomNameDraft(event.target.value)}
                    maxLength={30}
                    placeholder="اسم الغرفة"
                    className="h-12 rounded-xl bg-surface"
                  />
                  <input
                    ref={roomImageRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setRoomImageFile(file);
                      setRoomImagePreview(URL.createObjectURL(file));
                    }}
                  />
                </div>
                <Button
                  onClick={() => updateRoomDetails.mutate()}
                  disabled={updateRoomDetails.isPending}
                  className="h-11 w-full rounded-xl"
                >
                  {updateRoomDetails.isPending ? "جارٍ الحفظ..." : "حفظ الاسم والصورة"}
                </Button>
              </section>
            )}
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
                    <UserAvatar
                      src={p.avatar_url}
                      name={p.display_name}
                      size={40}
                      vipLevel={p.vip_level}
                      frame={p.frame_url}
                    />
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
                    onClick={() =>
                      seatAction.mutate({ seat, patch: { is_locked: !seat.is_locked } })
                    }
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

function RoomImagePreview({ stored }: { stored: string | null }) {
  const [resolved, setResolved] = useState<string | null>(
    stored?.startsWith("blob:") ? stored : null,
  );

  useEffect(() => {
    if (stored?.startsWith("blob:")) {
      setResolved(stored);
      return;
    }
    let active = true;
    void resolveMediaUrl(stored).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [stored]);

  if (!resolved) return <Camera className="h-5 w-5 text-muted-foreground" />;
  return <img src={resolved} alt="صورة الغرفة" className="h-full w-full object-cover" />;
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

/* أزرار التحكم المدوّرة الصغيرة أسفل الغرفة */
function RoundControl({
  label,
  children,
  onClick,
  active,
  tone,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  tone?: "gift";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-colors",
        tone === "gift"
          ? "gradient-rose border-transparent text-primary-foreground"
          : active
            ? "border-success/60 bg-success/15 text-success"
            : "border-border/60 bg-surface/70 text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RoomUtility({
  label,
  children,
  onClick,
  active,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-2xl border bg-surface/80 px-2 text-muted-foreground",
        active ? "border-primary/60 text-primary" : "border-border/60",
      )}
    >
      {children}
      <span className="mt-0.5 whitespace-nowrap text-[8px] font-bold">{label}</span>
    </button>
  );
}
