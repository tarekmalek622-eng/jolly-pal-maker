import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages/$userId")({
  head: () => ({
    meta: [
      { title: "محادثة — صوتك" },
      { name: "description", content: "محادثة خاصة مباشرة داخل تطبيق صوتك." },
      { property: "og:title", content: "محادثة — صوتك" },
      { property: "og:description", content: "دردشة خاصة لحظية مع صديقك." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { userId: otherId } = Route.useParams();
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();
  const [text, setText] = useState("");
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
        .select("id, sender_id, body, created_at")
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

  return (
    <AppShell
      hideNav
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <button onClick={() => void navigate({ to: "/messages" })} className="p-1">
            <ArrowRight className="h-5 w-5" />
          </button>
          <UserAvatar src={other.data?.avatar_url} name={other.data?.display_name} size={40} vipLevel={other.data?.vip_level ?? 0} online={other.data?.is_online} />
          <div>
            <p className="text-sm font-bold">{other.data?.display_name ?? "..."}</p>
            <p className="text-[10px] text-muted-foreground">
              {other.data?.is_online ? "متصل الآن" : "غير متصل"}
            </p>
          </div>
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
                <p>{m.body}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-lg border-t border-border bg-background/95 p-3 backdrop-blur-xl">
        <div className="flex gap-2">
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
    </AppShell>
  );
}
