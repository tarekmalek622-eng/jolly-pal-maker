import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, LifeBuoy, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  status: "open" | "answered" | "closed";
  created_at: string;
};

type Msg = { id: string; body: string; is_staff: boolean; created_at: string; sender_id: string };

const STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  answered: "تم الرد",
  closed: "مغلقة",
};

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "الدعم والشكاوى — التاج" },
      {
        name: "description",
        content: "أرسل شكوى أو استفسارًا لفريق دعم تطبيق التاج وتابع الرد داخل التطبيق.",
      },
      { property: "og:title", content: "الدعم والشكاوى — التاج" },
      { property: "og:description", content: "تذاكر دعم ومتابعة الردود مباشرة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { userId } = useSupabaseSession();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const isStaff = useQuery({
    queryKey: ["support-staff", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_has_section", {
        _user_id: userId!,
        _section: "support",
      });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  const tickets = useQuery<Ticket[]>({
    queryKey: ["support-tickets", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db
        .from("support_tickets")
        .select("id, user_id, subject, category, status, created_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Ticket[];
    },
  });

  const thread = useQuery<Msg[]>({
    queryKey: ["support-thread", openId],
    enabled: Boolean(openId),
    queryFn: async () => {
      const { data, error } = await db
        .from("support_messages")
        .select("id, body, is_staff, created_at, sender_id")
        .eq("ticket_id", openId!)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Msg[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("support_create_ticket", {
        _subject: subject.trim(),
        _category: "general",
        _body: body.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم إرسال شكواك — سيردّ الفريق قريبًا");
      setSubject("");
      setBody("");
      void tickets.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: async (close: boolean) => {
      const { error } = await db.rpc("support_reply", {
        _ticket_id: openId,
        _body: reply.trim(),
        _close: close,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setReply("");
      void thread.refetch();
      void tickets.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold">{isStaff.data ? "إدارة الدعم" : "الدعم والشكاوى"}</h1>
        </header>
      }
    >
      <div className="space-y-5 pb-28">
        {!isStaff.data && (
          <section className="surface-card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold">شكوى جديدة</h2>
            </div>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="عنوان الشكوى"
              className="h-11 rounded-2xl bg-surface"
            />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="اكتب التفاصيل..."
              className="min-h-24 rounded-2xl bg-surface"
            />
            <Button
              className="h-11 w-full gradient-gold text-primary-foreground"
              disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 5}
              onClick={() => create.mutate()}
            >
              إرسال
            </Button>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold">{isStaff.data ? "كل التذاكر" : "تذاكري"}</h2>
          {tickets.isLoading && (
            <p className="py-6 text-center text-xs text-muted-foreground">جارٍ التحميل...</p>
          )}
          {tickets.isError && (
            <div className="surface-card p-4 text-center text-sm">
              <p className="mb-2">تعذر تحميل التذاكر</p>
              <Button className="h-9" onClick={() => void tickets.refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          )}
          {!tickets.isLoading && (tickets.data ?? []).length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">لا توجد تذاكر حتى الآن</p>
          )}
          {(tickets.data ?? []).map((t) => (
            <div key={t.id} className="surface-card p-3.5">
              <button
                type="button"
                className="flex w-full items-center gap-3 text-start"
                onClick={() => setOpenId((v) => (v === t.id ? null : t.id))}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{t.subject}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("ar")}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 text-[10px] font-bold",
                    t.status === "closed"
                      ? "bg-surface text-muted-foreground"
                      : t.status === "answered"
                        ? "bg-primary/15 text-primary"
                        : "bg-accent/15 text-accent",
                  )}
                >
                  {STATUS_LABELS[t.status]}
                </span>
              </button>

              {openId === t.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {(thread.data ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex", m.is_staff ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-2 text-xs",
                          m.is_staff ? "gradient-gold text-primary-foreground" : "bg-surface",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-[9px] opacity-70">
                          {new Date(m.created_at).toLocaleString("ar", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {t.status !== "closed" && (
                    <div className="flex gap-2 pt-1">
                      <Input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="اكتب ردك..."
                        className="h-10 flex-1 rounded-2xl bg-surface"
                      />
                      <Button
                        className="h-10 w-10 shrink-0 gradient-gold p-0 text-primary-foreground"
                        disabled={sendReply.isPending || reply.trim().length < 2}
                        onClick={() => sendReply.mutate(false)}
                        aria-label="إرسال"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      {isStaff.data && (
                        <Button
                          variant="outline"
                          className="h-10 shrink-0 text-xs"
                          disabled={sendReply.isPending || reply.trim().length < 2}
                          onClick={() => sendReply.mutate(true)}
                        >
                          رد وإغلاق
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
