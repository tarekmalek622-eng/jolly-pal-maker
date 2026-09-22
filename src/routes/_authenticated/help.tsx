import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "مركز المساعدة — التاج" },
      {
        name: "description",
        content:
          "أسئلة شائعة عن الشحن والاستبدال والغرف والهدايا والـ VIP والحماية في تطبيق التاج.",
      },
      { property: "og:title", content: "مركز المساعدة — التاج" },
      { property: "og:description", content: "إجابات سريعة لأكثر الأسئلة تكرارًا." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

const FAQ: { q: string; a: string }[] = [
  {
    q: "كيف أشحن رصيد الماس؟",
    a: 'من صفحة المحفظة اختر "شحن"، ثم اختر الباقة وأرسل الطلب. يظهر الرصيد بعد موافقة الإدارة على الطلب.',
  },
  {
    q: "كيف أستبدل رصيد الدعم؟",
    a: 'من صفحة المحفظة اختر "استبدال" وحدد المبلغ. يتم التحويل داخل المحفظة فورًا وفق الحد المسموح.',
  },
  {
    q: "كيف أنشئ غرفة؟",
    a: "من صفحة الغرف اضغط زر إنشاء غرفة، ثم اكتب الاسم والوصف واختر التصنيف. تصبح مالك الغرفة وتستطيع تعيين مشرفين.",
  },
  {
    q: "كيف أصعد على المايك؟",
    a: "ادخل الغرفة واضغط على أي مقعد فارغ. إذا كانت الغرفة تطلب موافقة، يظهر طلبك للمالك أو المشرف.",
  },
  {
    q: "ما فائدة الـ VIP وكيف أحصل عليه؟",
    a: "الـ VIP يمنحك إطارًا وشارة ولون اسم مميز وحماية للمايك. يمكن شراؤه من متجر VIP أو استلامه كهدية من صديق.",
  },
  {
    q: "ما هي نقاط الشحن وCVIP؟",
    a: "كل شحنة تُضيف نقاط شحن، وعند الوصول لحد معين تُرقّى تلقائيًا إلى مستوى CVIP أعلى بمزايا إضافية.",
  },
  {
    q: "كيف تُحسب مستويات العلاقة؟",
    a: "الهدايا المتبادلة بينك وبين الطرف الآخر تضيف نقاطًا للعلاقة، وعند كل حد تصعد العلاقة مستوى حتى المستوى السابع بإطار ذهبي.",
  },
  {
    q: 'لماذا أرى "لا توجد غرف"؟',
    a: 'غالبًا مشكلة اتصال مؤقتة. اضغط "إعادة المحاولة" أو بدّل التصنيف، وإن استمر الأمر تواصل مع الدعم.',
  },
  {
    q: "كيف أبلّغ عن مستخدم مخالف؟",
    a: 'افتح ملفه الشخصي واضغط زر الخيارات ثم "إبلاغ"، واكتب السبب. يصل التقرير للإدارة مع سجل كامل.',
  },
  {
    q: "نسيت بيانات الدخول أو حسابي موقوف؟",
    a: "أرسل تذكرة من صفحة الدعم موضحًا الآيدي والمشكلة، وسيراجعها فريق الإدارة.",
  },
];

function HelpPage() {
  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-black">مركز المساعدة</h1>
        </header>
      }
    >
      <div className="px-4 pb-10">
        <div className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="text-sm font-black">لم تجد إجابتك؟</p>
            <Link to="/support" className="text-[11px] font-bold text-primary">
              افتح تذكرة دعم
            </Link>
          </div>
        </div>

        <Accordion type="single" collapsible className="mt-4 space-y-2">
          {FAQ.map((item, i) => (
            <AccordionItem key={item.q} value={`q${i}`} className="surface-card border-none px-4">
              <AccordionTrigger className="text-right text-sm font-bold">{item.q}</AccordionTrigger>
              <AccordionContent className="text-xs leading-6 text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </AppShell>
  );
}
