import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export function FamilyChat({ familyId, userId }: { familyId: string; userId: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["family-chat", familyId],
    queryFn: async () => {
      const { data, error } = await db
        .from("family_messages")
        .select("id, user_id, body, created_at, profiles:user_id(display_name)")
        .eq("family_id", familyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).reverse();
    },
  });
  const { refetch } = msgs;

  useEffect(() => {
    const ch = supabase
      .channel(`family-chat-${familyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "family_messages", filter: `family_id=eq.${familyId}` },
        () => void refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [familyId, refetch]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.data?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await db.from("family_messages").insert({ family_id: familyId, user_id: userId, body });
    setSending(false);
    if (error) {
      toast.error("تعذر الإرسال");
      return;
    }
    setText("");
    void refetch();
  };

  return (
    <section className="surface-card space-y-2 p-3">
      <p className="text-sm font-bold">دردشة العائلة</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {(msgs.data ?? []).length === 0 && (
          <p className="py-4 text-center text-[11px] text-muted-foreground">ابدأ أول رسالة للعائلة</p>
        )}
        {(msgs.data ?? []).map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs ${m.user_id === userId ? "ms-auto bg-primary/20" : "bg-surface"}`}
          >
            <p className="text-[10px] font-bold text-primary">{m.profiles?.display_name ?? "عضو"}</p>
            <p className="break-words">{m.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="اكتب رسالة…"
          className="h-10 min-w-0 flex-1 rounded-2xl bg-surface px-3 text-sm outline-none"
        />
        <button
          disabled={sending}
          onClick={() => void send()}
          className="grid h-10 w-10 place-items-center rounded-2xl gradient-gold text-primary-foreground"
          aria-label="إرسال"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
