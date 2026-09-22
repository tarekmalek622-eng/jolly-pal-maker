import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Ban, Flag, Gift, Mic, Send, Smile, Square, Trash2 } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GiftSheet } from "@/components/GiftSheet";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  head: () => ({
    meta: [
      { title: "محادثة — التاج" },
      { name: "description", content: "محادثة خاصة مباشرة داخل تطبيق التاج." },
      { property: "og:title", content: "محادثة — التاج" },
      { property: "og:description", content: "دردشة خاصة لحظية مع صديقك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { userId: otherId } = Route.useParams();
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const other = useQuery({
    queryKey: ["profile-by-id", otherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level, is_online")
        .eq("id", otherId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const messages = useQuery({
    queryKey: ["dm", userId, otherId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select(
          "id, sender_id, receiver_id, body, kind, metadata, read_at, created_at, audio_url, audio_duration_ms",
        )
        .or(
          `and(sender_id.eq.${userId!},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId!})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`dm-${userId}-${otherId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => {
        void messages.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, otherId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length]);

  useEffect(() => {
    if (!userId) return;
    void supabase.rpc("mark_direct_messages_read", { _sender_id: otherId });
  }, [userId, otherId, messages.data?.length]);

  const deleteMessage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("direct_messages").delete().eq("id", id).eq("sender_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => void messages.refetch(),
    onError: () => toast.error("تعذر حذف الرسالة"),
  });

  const blockUser = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blocks").upsert({ blocker_id: userId!, blocked_id: otherId }, { onConflict: "blocker_id,blocked_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حجب المستخدم"); void navigate({ to: "/messages" }); },
    onError: () => toast.error("تعذر الحجب"),
  });

  const reportUser = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reports").insert({ reporter_id: userId!, target_type: "user", target_id: otherId, reason: "إبلاغ من المحادثة الخاصة" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم إرسال البلاغ للإدارة"),
    onError: () => toast.error("تعذر إرسال البلاغ"),
  });

  async function send() {
    const body = text.trim();
    if (!body || !userId) return;
    setText("");
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: userId,
      receiver_id: otherId,
      body,
      kind: "text",
    });
    if (error) {
      toast.error("تعذر إرسال الرسالة");
      setText(body);
      return;
    }
    void messages.refetch();
  }

  /* ---------- رسالة صوتية حقيقية: تسجيل من الميكروفون ورفعها للمحادثة ---------- */
  async function startRecording() {
    if (!userId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = Date.now() - startedAtRef.current;
        setRecording(false);
        if (duration < 700) {
          toast.error("التسجيل قصير جدًا");
          return;
        }
        setSendingVoice(true);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const path = `${userId}/${Date.now()}.webm`;
          const { error: upErr } = await supabase.storage
            .from("voice-messages")
            .upload(path, blob, { contentType: blob.type, upsert: true });
          if (upErr) throw upErr;
          const { error } = await supabase.from("direct_messages").insert({
            sender_id: userId,
            receiver_id: otherId,
            body: "رسالة صوتية",
            kind: "voice",
            audio_url: `voice-messages/${path}`,
            audio_duration_ms: duration,
          });
          if (error) throw error;
          void messages.refetch();
        } catch {
          toast.error("تعذر إرسال الرسالة الصوتية");
        } finally {
          setSendingVoice(false);
        }
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("تعذر الوصول إلى الميكروفون");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  return (
    <AppShell
      hideNav
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <button onClick={() => void navigate({ to: "/messages" })} className="p-1">
            <ArrowRight className="h-5 w-5" />
          </button>
          <UserAvatar src={other.data?.avatar_url} name={other.data?.display_name} size={40} vipLevel={other.data?.vip_level ?? 0} online={other.data?.is_online} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{other.data?.display_name ?? "..."}</p>
            <p className="text-[10px] text-muted-foreground">
              {other.data?.is_online ? "متصل الآن" : "غير متصل"}
            </p>
          </div>
          <Button variant="ghost" onClick={() => reportUser.mutate()} className="h-9 w-9 p-0" aria-label="إبلاغ"><Flag className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => blockUser.mutate()} className="h-9 w-9 p-0 text-destructive" aria-label="حجب"><Ban className="h-4 w-4" /></Button>
        </header>
      }
    >
      <div className="space-y-2 pb-24">
        {(messages.data ?? []).map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                  mine ? "gradient-gold text-primary-foreground" : "bg-surface",
                )}
              >
                {m.kind === "voice" && m.audio_url ? (
                  <VoiceBubble stored={m.audio_url} durationMs={m.audio_duration_ms} />
                ) : (
                  <p>{m.kind === "gift" ? `🎁 ${m.body}` : m.body}</p>
                )}
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                </p>
                {mine && <button onClick={() => deleteMessage.mutate(m.id)} className="mt-1 opacity-70" aria-label="حذف الرسالة"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-border bg-background/95 p-3 backdrop-blur-xl">
        {emojiOpen && <div className="mb-2 flex justify-around rounded-xl bg-surface p-2 text-xl">{["😀", "😂", "❤️", "👏", "🔥", "🎉"].map((emoji) => <button key={emoji} onClick={() => { setText((value) => `${value}${emoji}`); setEmojiOpen(false); }}>{emoji}</button>)}</div>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEmojiOpen((value) => !value)} className="h-12 w-12 rounded-2xl p-0" aria-label="رموز تعبيرية"><Smile className="h-5 w-5" /></Button>
          <Button variant="outline" onClick={() => setGiftOpen(true)} className="h-12 w-12 rounded-2xl p-0" aria-label="إرسال هدية"><Gift className="h-5 w-5" /></Button>
          <Button
            variant={recording ? "destructive" : "outline"}
            disabled={sendingVoice}
            onClick={() => (recording ? stopRecording() : void startRecording())}
            className="h-12 w-12 rounded-2xl p-0"
            aria-label={recording ? "إيقاف التسجيل وإرسال" : "رسالة صوتية"}
          >
            {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="اكتب رسالة..."
            className="h-12 flex-1 rounded-2xl bg-surface"
          />
          <Button onClick={() => void send()} className="h-12 w-12 rounded-2xl gradient-gold p-0 text-primary-foreground">
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {other.data && <GiftSheet open={giftOpen} onOpenChange={setGiftOpen} roomId={null} initialReceiverId={otherId} targets={[{ id: otherId, display_name: other.data.display_name, avatar_url: other.data.avatar_url, vip_level: other.data.vip_level }]} onSent={async (giftName) => {
        if (!userId) return;
        const { error } = await supabase.from("direct_messages").insert({ sender_id: userId, receiver_id: otherId, body: giftName, kind: "gift" });
        if (error) toast.error("وصلت الهدية لكن تعذر عرضها في المحادثة");
        else void messages.refetch();
      }} />}
    </AppShell>
  );
}
