import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Loader2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { listCrownMessages } from "@/lib/crown.functions";
import { eventArt } from "@/lib/event-art";

export const Route = createFileRoute("/_authenticated/crown")({
  head: () => ({
    meta: [
      { title: "رسائل التاج — صوتك" },
      { name: "description", content: "الرسائل الرسمية من إدارة صوتك: نتائج الأحداث، الفائزون، والإعلانات المهمة." },
      { property: "og:title", content: "رسائل التاج — صوتك" },
      { property: "og:description", content: "إعلانات ونتائج أحداث صوتك الرسمية في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CrownPage,
});

const KIND_LABEL: Record<string, string> = {
  announcement: "إعلان",
  event_result: "نتائج حدث",
  event_start: "حدث جديد",
  maintenance: "صيانة",
  update: "تحديث",
};

function CrownPage() {
  const fetchMessages = useServerFn(listCrownMessages);
  const messages = useQuery({
    queryKey: ["crown-messages"],
    queryFn: () => fetchMessages(),
    staleTime: 30_000,
  });

  return (
    <AppShell>
      <PageHeader title="رسائل التاج" subtitle="الرسائل الرسمية من إدارة صوتك" />
      <div className="space-y-3 px-3 pb-24">
        {messages.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (messages.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد رسائل بعد.</p>
        ) : (
          (messages.data ?? []).map((m) => (
            <article
              key={m.id}
              className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-background shadow-sm"
            >
              <header className="flex items-center gap-2 border-b border-amber-500/20 px-3 py-2">
                <Crown className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">{KIND_LABEL[m.kind] ?? "رسالة"}</span>
                <span className="ms-auto text-[11px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("ar-EG")}
                </span>
              </header>
              {m.image_url ? (
                <img
                  src={eventArt(m.image_url)}
                  alt={m.title}
                  loading="lazy"
                  width={1024}
                  height={640}
                  className="h-40 w-full object-cover"
                />
              ) : null}
              <div className="space-y-1 p-3">
                <h2 className="text-sm font-bold">{m.title}</h2>
                <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{m.body}</p>
              </div>
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
