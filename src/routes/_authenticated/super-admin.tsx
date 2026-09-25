import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Crown,
  Gift,
  Landmark,
  Megaphone,
  Mic,
  MicOff,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseSession } from "@/hooks/use-session";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({
    meta: [
      { title: "حدث سوبر أدمن العرب — صوتك" },
      { name: "description", content: "حدث سوبر أدمن العرب: اجمع الأصوات بالهدايا واربح لقب سوبر أدمن مع راتب شهري ومساعدين وكود من 3 أرقام." },
      { property: "og:title", content: "حدث سوبر أدمن العرب — صوتك" },
      { property: "og:description", content: "أرسل الهدايا، اجمع الأصوات، واربح لقب سوبر أدمن العرب لمدة 90 يومًا مع راتب شهري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuperAdminEventPage,
});

const RIGHTS = [
  { icon: Trash2, label: "إدارة البث" },
  { icon: Users, label: "إدارة بيانات المستخدم" },
  { icon: Landmark, label: "مدير الغرفة الرسمي" },
  { icon: UserMinus, label: "إخراجه من الغرفة" },
  { icon: ShieldCheck, label: "مساعد في إلغاء الحظر" },
  { icon: Landmark, label: "إدارة المجتمع" },
  { icon: UserX, label: "عدم الطرد من الغرفة" },
  { icon: MicOff, label: "كتم صوت الميكروفون" },
  { icon: Mic, label: "إخراجه من الميكروفون" },
];

const RULES = [
  "يمكن لجميع المستخدمين المشاركة في انتخابات سوبر أدمن العرب خلال فترة الحدث.",
  "مدة ولاية سوبر الأدمن هي 90 يومًا.",
  "إذا فشل سوبر الأدمن الفائق في الوفاء بالتزاماته أو أساء استخدام حقوقه أثناء فترة ولايته، فسيتم فصله مباشرة.",
  "سيتم معاقبة سوبر الأدمن أيضًا عن أي إساءة أو سلوك غير قانوني ينتهك المجتمع، دون أي حصانة. ومثل المستخدمين العاديين، سيتم معاقبتهم مباشرة دون إشعار مسبق.",
  "حق كل مستخدم في الحصول على الحرية في غرفته الخاصة هو حق أساسي، ولا يمكن المساس به.",
  "يتحمل سوبر الأدمن الفائز مسؤولية المساهمة في تطوير بلده، ودعوة المؤيدين للانضمام إلى صوتك، ومعاملة كل مستخدم على قدم المساواة، والتعاون بنشاط مع العمل الرسمي.",
  "يتلقى سوبر الأدمن والمساعدون رواتبهم الشهرية وفق نظام الحدث.",
  "يمكن للفائز عقد فعاليات رسمية في بلده خلال فترة ولايته، وسيقدم التطبيق هدايا كأموال للحدث.",
  "يتمتع سوبر الأدمن بصلاحية حذف البث غير القانوني، مثل الإهانات والتهديدات في بلده.",
  "يتمتع سوبر الأدمن بسلطة إعادة تعيين المستخدمين غير القانونيين وصور الغرف الرمزية في بلده الذين يستخدمون المواد الإباحية، والإغلاقات السوداء، وما إلى ذلك.",
  "يمكن لسوبر الأدمن طرد المستخدمين الذين يسببون مشاكل في الغرف، وكتم صوت الميكروفون، وفصله عن الشبكة.",
  "يتمتع سوبر الأدمن بالحق في حذف المنشورات والتعليقات على الساحة التي تنتهك اللوائح داخل بلده.",
  "يجوز لسوبر الأدمن التقدم بطلب للحصول على مساعدة في رفع الحظر عن مستخدمي دولتهم الذين تم حظرهم بسبب انتهاكات، ويخضع رفع الحظر في نهاية المطاف لتقدير مسؤول مختص.",
  "يحصل سوبر الأدمن ومساعدوه على ميداليات خاصة وعلامات هوية خاصة (كود من 3 أرقام).",
];

const fmt = (n: number) => n.toLocaleString("en-US");

function SuperAdminEventPage() {
  const { userId } = useSupabaseSession();
  const queryClient = useQueryClient();
  const [giftOpen, setGiftOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [assistantId, setAssistantId] = useState("");

  const event = useQuery({
    queryKey: ["sa-event"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sa_current_event");
      if (error) throw error;
      return data as { id: string; title: string; starts_at: string; ends_at: string; active: boolean } | null;
    },
  });

  const myVotes = useQuery({
    queryKey: ["sa-my-votes", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sa_my_votes");
      if (error) throw error;
      return data as { earned: number; gifted: number; available: number };
    },
  });

  const leaderboard = useQuery({
    queryKey: ["sa-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sa_leaderboard", { _limit: 50 });
      if (error) throw error;
      return (data ?? []) as { user_id: string; public_id: string; display_name: string; avatar_url: string | null; votes: number }[];
    },
    refetchInterval: 30000,
  });

  const myWinner = useQuery({
    queryKey: ["sa-my-winner", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("sa_winners")
        .select("id, rank, three_digit_id, assistants_count, salary, ends_at")
        .eq("user_id", userId!)
        .eq("active", true)
        .gt("ends_at", new Date().toISOString())
        .maybeSingle();
      if (!data) return null;
      const { data: assistants } = await supabase
        .from("sa_assistants")
        .select("id, user_id, three_digit_id, profiles:user_id(display_name, public_id)")
        .eq("winner_id", data.id);
      return { ...data, assistants: assistants ?? [] };
    },
  });

  const isSuperAdmin = useQuery({
    queryKey: ["is-super-admin", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase.rpc("is_super_admin", { _user_id: userId! });
      return Boolean(data);
    },
  });

  const giftVotes = useMutation({
    mutationFn: async () => {
      const { data: target, error: tErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("public_id", targetId.trim())
        .maybeSingle();
      if (tErr) throw tErr;
      if (!target) throw new Error("لا يوجد مستخدم بهذا الـ ID");
      const { error } = await supabase.rpc("sa_gift_votes", { _to: target.id, _votes: Number(amount) });
      if (error) throw error;
      return target.display_name;
    },
    onSuccess: (name) => {
      toast.success(`تم إهداء ${fmt(Number(amount))} صوت إلى ${name}`);
      setGiftOpen(false);
      setTargetId("");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["sa-my-votes"] });
      queryClient.invalidateQueries({ queryKey: ["sa-leaderboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAssistant = useMutation({
    mutationFn: async () => {
      if (!myWinner.data) throw new Error("لست فائزًا");
      const { data: target, error: tErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("public_id", assistantId.trim())
        .maybeSingle();
      if (tErr) throw tErr;
      if (!target) throw new Error("لا يوجد مستخدم بهذا الـ ID");
      const { error } = await supabase.rpc("sa_add_assistant", { _winner_id: myWinner.data.id, _user_id: target.id });
      if (error) throw error;
      return target.display_name;
    },
    onSuccess: (name) => {
      toast.success(`تمت إضافة ${name} كمساعد`);
      setAssistantId("");
      queryClient.invalidateQueries({ queryKey: ["sa-my-winner"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settle = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sa_settle_event");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم تتويج الفائزين وإنهاء الحدث");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const paySalaries = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sa_pay_salaries");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => toast.success(`تم صرف الرواتب لـ ${n} مستفيد`),
    onError: (e: Error) => toast.error(e.message),
  });

  const endsAt = event.data ? new Date(event.data.ends_at).getTime() : 0;
  const msLeft = Math.max(0, endsAt - Date.now());
  const daysLeft = Math.floor(msLeft / 86400000);
  const hoursLeft = Math.floor((msLeft % 86400000) / 3600000);

  return (
    <div className="min-h-screen pb-24" dir="rtl">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur">
        <Link to="/home" className="text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-sm font-bold">انتخابات سوبر أدمن العرب</h1>
        <span className="w-5" />
      </header>

      <div className="mx-auto max-w-lg space-y-5 p-4">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-amber-950/60 via-background to-background p-6 text-center">
          <Crown className="mx-auto h-12 w-12 text-amber-400" />
          <h2 className="mt-2 text-xl font-black text-amber-300">سوبر أدمن العرب</h2>
          <p className="mt-1 text-xs text-muted-foreground">لجميع الدول العربية • حدث لمدة 7 أيام</p>
          {event.data?.active ? (
            <p className="mt-3 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1 text-xs font-bold text-amber-300">
              متبقّي {daysLeft} يوم و {hoursLeft} ساعة
            </p>
          ) : (
            <p className="mt-3 inline-block rounded-full border border-border bg-muted px-4 py-1 text-xs font-bold">انتهى الحدث</p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            اجمع هدية الحدث بإرسال 300 ألف هدية لتحصل على 100 ألف صوت قابلة للإهداء لأي مستخدم. كل 3 كوينز هدايا = صوت واحد.
          </p>
        </section>

        {/* My votes */}
        <section className="surface-card space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Gift className="h-4 w-4 text-primary" /> أصواتي
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="text-lg font-black text-amber-300">{fmt(myVotes.data?.earned ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground">أصوات كسبتها</p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="text-lg font-black">{fmt(myVotes.data?.gifted ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground">أهديتها</p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-3">
              <p className="text-lg font-black text-emerald-400">{fmt(myVotes.data?.available ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground">متاحة للإهداء</p>
            </div>
          </div>
          {event.data?.active && (
            <Button className="w-full" onClick={() => setGiftOpen((v) => !v)}>
              إهداء أصوات لمستخدم
            </Button>
          )}
          {giftOpen && (
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="ID المستخدم (مثال: 36765336)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                inputMode="numeric"
              />
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="عدد الأصوات"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                inputMode="numeric"
              />
              <Button
                className="w-full"
                disabled={giftVotes.isPending || !targetId.trim() || !Number(amount)}
                onClick={() => giftVotes.mutate()}
              >
                تأكيد الإهداء
              </Button>
            </div>
          )}
        </section>

        {/* Leaderboard */}
        <section className="surface-card p-4">
          <h3 className="mb-3 text-sm font-bold">🏆 المتصدرون</h3>
          <div className="space-y-2">
            {(leaderboard.data ?? []).map((u, i) => (
              <Link
                key={u.user_id}
                to="/u/$publicId"
                params={{ publicId: u.public_id }}
                className="flex items-center gap-3 rounded-2xl border border-border/60 p-2"
              >
                <span className="w-7 text-center text-lg font-black">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <UserAvatar src={u.avatar_url} name={u.display_name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{u.display_name}</p>
                  <p className="text-[10px] text-muted-foreground">ID: {u.public_id}</p>
                </div>
                <span className="text-sm font-black text-amber-300">{fmt(u.votes)} صوت</span>
              </Link>
            ))}
            {leaderboard.data?.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">لا توجد أصوات بعد — كن أول من يجمع الأصوات!</p>
            )}
          </div>
        </section>

        {/* Rewards */}
        <section className="surface-card space-y-3 p-4">
          <h3 className="text-sm font-bold">🎁 مكافآت سوبر الأدمن</h3>
          {[
            { medal: "🥇", title: "الأول", salary: "100 مليار شهريًا", assistants: "5 مساعدين (50 مليار لكل مساعد)" },
            { medal: "🥈", title: "الثاني", salary: "90 مليار شهريًا", assistants: "3 مساعدين (50 مليار لكل مساعد)" },
            { medal: "🥉", title: "الثالث", salary: "80 مليار شهريًا", assistants: "مساعدان (50 مليار لكل مساعد)" },
          ].map((r) => (
            <div key={r.title} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
              <span className="text-2xl">{r.medal}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-300">{r.title}: سوبر أدمن + {r.assistants}</p>
                <p className="text-[11px] text-muted-foreground">الراتب: {r.salary}</p>
              </div>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            كل سوبر أدمن يحصل على شارة خاصة وكود ID من 3 أرقام لمدة 90 يومًا، مع صلاحية تعيين مساعديه وتعديل أكوادهم، وامتياز دعوة مستخدمين من دولته للاشتراك، ومزايا إدارية خاصة.
          </p>
        </section>

        {/* Rights */}
        <section className="surface-card p-4">
          <h3 className="mb-3 text-center text-sm font-bold text-amber-300">— حقوق سوبر الأدمن —</h3>
          <div className="grid grid-cols-3 gap-2">
            {RIGHTS.map((r) => (
              <div key={r.label} className="flex flex-col items-center gap-1 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/40 to-background p-3 text-center">
                <r.icon className="h-6 w-6 text-amber-400" />
                <span className="text-[10px] font-semibold leading-tight">{r.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section className="surface-card p-4">
          <h3 className="mb-3 text-center text-sm font-bold text-amber-300">— القواعد —</h3>
          <ol className="space-y-2">
            {RULES.map((rule, i) => (
              <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-bold text-amber-400">{i + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Winner panel */}
        {myWinner.data && (
          <section className="surface-card space-y-3 border-amber-500/40 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-300">
              <BadgeCheck className="h-4 w-4" /> أنت سوبر أدمن — المركز {myWinner.data.rank}
            </h3>
            <p className="text-xs text-muted-foreground">
              كودك: <span className="font-black text-amber-300">{myWinner.data.three_digit_id}</span> • الراتب: {fmt(myWinner.data.salary)} شهريًا • تنتهي الولاية {new Date(myWinner.data.ends_at).toLocaleDateString("ar")}
            </p>
            <div className="space-y-1">
              <p className="text-xs font-bold">المساعدون ({myWinner.data.assistants.length}/{myWinner.data.assistants_count}):</p>
              {myWinner.data.assistants.map((a) => (
                <p key={a.id} className="text-xs text-muted-foreground">
                  • {(a.profiles as { display_name: string } | null)?.display_name} — كود {a.three_digit_id}
                </p>
              ))}
            </div>
            {myWinner.data.assistants.length < myWinner.data.assistants_count && (
              <div className="flex gap-2">
                <input
                  value={assistantId}
                  onChange={(e) => setAssistantId(e.target.value)}
                  placeholder="ID المساعد"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  inputMode="numeric"
                />
                <Button disabled={addAssistant.isPending || !assistantId.trim()} onClick={() => addAssistant.mutate()}>
                  إضافة
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Owner controls */}
        {isSuperAdmin.data && (
          <section className="surface-card space-y-2 border-destructive/40 p-4">
            <h3 className="text-sm font-bold">صلاحيات المالك</h3>
            <Button variant="destructive" className="w-full" disabled={settle.isPending} onClick={() => settle.mutate()}>
              تتويج الفائزين وإنهاء الحدث
            </Button>
            <Button variant="outline" className="w-full" disabled={paySalaries.isPending} onClick={() => paySalaries.mutate()}>
              <Wallet className="ml-1 h-4 w-4" /> صرف الرواتب الشهرية
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
