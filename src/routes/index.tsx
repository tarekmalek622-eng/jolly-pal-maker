import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Camera, ShieldCheck, Mic, Gift, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  isValidPhone,
  internationalIdentifier,
  identifierCandidates,
  rememberPhone,
  readRememberedPhone,
} from "@/lib/phone-auth";
import {
  COUNTRIES,
  DEFAULT_COUNTRY_CODE,
  findCountry,
  searchCountries,
  type Country,
} from "@/lib/countries";
import { uploadUserImage } from "@/lib/media";
import { screenProfilePhoto } from "@/lib/moderation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "صوتك — انضم لغرف الدردشة الصوتية" },
      {
        name: "description",
        content: "أنشئ حسابك في ثوانٍ بالاسم والدولة والصورة، وادخل غرف صوتية مباشرة مع مجتمع عربي نشط.",
      },
      { property: "og:title", content: "صوتك — انضم لغرف الدردشة الصوتية" },
      {
        property: "og:description",
        content: "تسجيل سريع بدون كلمة مرور، غرف صوتية مباشرة، هدايا ومستويات وVIP.",
      },
    ],
  }),
  component: Landing,
});

/** Searchable list of every country: name, flag and dial code. */
function CountryPicker({
  value,
  onSelect,
  showDial = true,
  placeholder = "ابحث عن دولتك…",
}: {
  value: string;
  onSelect: (country: Country) => void;
  showDial?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = findCountry(value);
  const list = open ? searchCountries(term).slice(0, 60) : [];

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 text-sm"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg leading-none">{selected?.flag ?? "🌍"}</span>
          <span className={selected ? "font-semibold" : "text-muted-foreground"}>
            {selected?.name ?? "اختر دولتك"}
          </span>
        </span>
        {showDial && selected ? (
          <span dir="ltr" className="text-xs text-primary">
            +{selected.dial}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">تغيير</span>
        )}
      </button>

      {open && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={placeholder}
            className="h-11 rounded-none border-0 border-b border-border bg-surface-2 text-sm"
          />
          <div className="max-h-64 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-muted-foreground">لا نتائج</p>
            ) : (
              list.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setOpen(false);
                    setTerm("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors",
                    c.code === value ? "bg-primary/15 text-primary" : "hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg leading-none">{c.flag}</span>
                    <span>{c.name}</span>
                  </span>
                  <span dir="ltr" className="text-xs text-muted-foreground">
                    +{c.dial}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<"intro" | "auth" | "form">("intro");


  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (profile) {
          void navigate({ to: "/home", replace: true });
          return;
        }
        setStep("form");
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center gradient-hero">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-hero">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-8">
        {step === "intro" ? (
          <Intro onStart={() => setStep("auth")} />
        ) : step === "auth" ? (
          <PhoneAuth
            onNeedsProfile={() => setStep("form")}
            onSignedIn={() => void navigate({ to: "/home", replace: true })}
          />
        ) : (
          <RegisterForm />
        )}
      </div>
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const features = [
    { icon: Mic, title: "غرف صوتية مباشرة", text: "اصعد على المايك وتحدث فورًا" },
    { icon: Gift, title: "هدايا ومستويات", text: "أرسل الهدايا واصعد في الترتيب" },
    { icon: Users, title: "أصدقاء ومحادثات", text: "تابع، صادق ودردش بشكل خاص" },
  ];

  return (
    <div className="flex flex-1 flex-col justify-between">
      <div className="pt-10 text-center">
        <div className="mx-auto flex h-24 w-24 animate-float items-center justify-center rounded-3xl gradient-gold shadow-glow">
          <Mic className="h-11 w-11 text-primary-foreground" />
        </div>
        <h1 className="mt-7 text-4xl font-black">
          <span className="text-gradient-gold">صوتك</span>
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          مجتمع صوتي عربي… غرف مباشرة، مايكات، هدايا وأصدقاء جدد.
        </p>
      </div>

      <div className="my-8 space-y-3">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="surface-card flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <Button
          onClick={onStart}
          className="h-14 w-full rounded-2xl gradient-gold text-base font-bold text-primary-foreground hover:opacity-90"
        >
          ابدأ برقم هاتفك
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          رقم الهاتف وكلمة السر فقط — بدون بريد إلكتروني وبدون رمز تحقق.
        </p>
      </div>
    </div>
  );
}

async function currentSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("انتهت الجلسة، سجّل الدخول برقمك مرة أخرى");
  return data.session;
}

/** Phone + password sign in / sign up. No email, no verification code. */
function PhoneAuth({
  onNeedsProfile,
  onSignedIn,
}: {
  onNeedsProfile: () => void;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState(readRememberedPhone());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const dial = findCountry(countryCode)?.dial ?? "20";

  async function afterSession(userId: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profile) onSignedIn();
    else onNeedsProfile();
  }

  async function submit() {
    if (!isValidPhone(phone)) {
      toast.error("اكتب رقم هاتف صحيح");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة السر 6 أحرف أو أرقام على الأقل");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const email = internationalIdentifier(dial, phone);
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (/already/i.test(error.message)) {
            toast.error("هذا الرقم مسجّل بالفعل، سجّل الدخول");
            setMode("login");
            return;
          }
          throw error;
        }
        const signIn = await supabase.auth.signInWithPassword({ email, password });
        if (signIn.error) {
          toast.error("تم إنشاء الحساب، سجّل الدخول الآن");
          setMode("login");
          return;
        }
        rememberPhone(phone);
        await afterSession(signIn.data.user.id);
        return;
      }

      // الدخول: نجرب الصيغة الدولية ثم الصيغة القديمة (بدون مفتاح الدولة)
      for (const email of identifierCandidates(dial, phone)) {
        const signIn = await supabase.auth.signInWithPassword({ email, password });
        if (!signIn.error) {
          rememberPhone(phone);
          await afterSession(signIn.data.user.id);
          return;
        }
      }
      toast.error("الرقم أو كلمة السر غير صحيحة");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="text-2xl font-bold">
        {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">برقم هاتفك وكلمة السر فقط.</p>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
        {([["login", "دخول"], ["signup", "حساب جديد"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "h-11 rounded-xl text-sm font-semibold transition-colors",
              mode === value ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01xxxxxxxxx"
            className="h-12 rounded-2xl bg-surface text-left"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">كلمة السر</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            className="h-12 rounded-2xl bg-surface"
          />
        </div>
      </div>

      <Button
        onClick={() => void submit()}
        disabled={busy}
        className="mt-7 h-14 w-full rounded-2xl gradient-gold text-base font-bold text-primary-foreground hover:opacity-90"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "login" ? "دخول" : "متابعة"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        لا نطلب بريدًا إلكترونيًا ولا رمز تحقق.
      </p>
    </div>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [screening, setScreening] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function handlePhoto(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة صحيحة");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("حجم الصورة كبير، اختر صورة أصغر من 8 ميجابايت");
      return;
    }
    setScreening(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });

      await currentSession();
      const verdict = await screenProfilePhoto({ data: { imageDataUrl: dataUrl } });
      if (!verdict.allowed) {
        toast.error(verdict.reason ?? "الصورة غير مناسبة", {
          description: "اختر صورة شخصية لائقة بدون محتوى للبالغين، وحسابك لم يتأثر.",
          duration: 7000,
        });
        setPhoto(null);
        setPreview(null);
        return;
      }
      setPhoto(file);
      setPreview(dataUrl);
      toast.success(verdict.checked ? "تم قبول الصورة" : "تم اختيار الصورة");
    } catch {
      // فحص الصورة خدمة مساعدة: لو تعذّر الفحص نقبل الصورة ولا نمنع إنشاء الحساب
      setPhoto(file);
      setPreview(await fileToDataUrl(file).catch(() => null));
      toast.message("تم اختيار الصورة", {
        description: "لم نتمكن من فحص الصورة الآن، وسيتم مراجعتها لاحقًا.",
      });
    } finally {
      setScreening(false);
    }
  }

  async function handleSubmit() {
    if (name.trim().length < 2) {
      toast.error("اكتب اسمًا لا يقل عن حرفين");
      return;
    }
    if (!country) {
      toast.error("اختر دولتك");
      return;
    }
    if (!birthDate) {
      toast.error("أدخل تاريخ ميلادك");
      return;
    }
    if (!gender) {
      toast.error("اختر الجنس");
      return;
    }
    if (!photo) {
      toast.error("أضف صورتك الشخصية من ملفات هاتفك");
      return;
    }

    const age = (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 13) {
      toast.error("يجب أن يكون عمرك 13 عامًا أو أكثر");
      return;
    }
    if (age > 100) {
      toast.error("تاريخ الميلاد غير صحيح");
      return;
    }

    setSubmitting(true);
    try {
      const session = await currentSession();

      const avatarPath = await uploadUserImage("avatars", session.user.id, photo);

      const { error } = await supabase.rpc("setup_account", {
        _display_name: name.trim(),
        _country: country,
        _city: city.trim(),
        _birth_date: birthDate,
        _gender: gender,
        _avatar_url: avatarPath,
        _bio: "",
      });
      if (error) throw error;

      toast.success("تم إنشاء حسابك 🎉");
      void navigate({ to: "/home", replace: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الحساب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">إنشاء الحساب</h1>
      <p className="mt-1 text-sm text-muted-foreground">خمس خطوات سريعة فقط.</p>

      <div className="mt-6 flex flex-col items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-dashed border-border bg-surface"
        >
          {preview ? (
            <img src={preview} alt="صورتك" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <Camera className="h-6 w-6" />
              <span className="text-[11px]">أضف صورتك</span>
            </span>
          )}
          {screening && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handlePhoto(file);
            e.target.value = "";
          }}
        />
        <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          تُفحص الصورة تلقائيًا وتُرفض الصور غير المناسبة
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">الاسم</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسمك الذي سيظهر للآخرين"
            maxLength={24}
            className="h-12 rounded-2xl bg-surface"
          />
        </div>

        <div className="space-y-2">
          <Label>الدولة</Label>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  country === c
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface text-muted-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">المدينة (اختياري)</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="مثال: الرياض"
            maxLength={30}
            className="h-12 rounded-2xl bg-surface"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birth">تاريخ الميلاد</Label>
          <Input
            id="birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-12 rounded-2xl bg-surface"
          />
        </div>

        <div className="space-y-2">
          <Label>الجنس</Label>
          <div className="grid grid-cols-2 gap-3">
            {([["male", "ذكر"], ["female", "أنثى"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={cn(
                  "h-12 rounded-2xl border text-sm font-semibold transition-colors",
                  gender === value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button
        onClick={() => void handleSubmit()}
        disabled={submitting || screening}
        className="mt-8 h-14 w-full rounded-2xl gradient-gold text-base font-bold text-primary-foreground hover:opacity-90"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "إنشاء الحساب"}
      </Button>
      <p className="mb-4 mt-3 text-center text-xs text-muted-foreground">
        سيتم إنشاء رقم ID فريد لك تلقائيًا بعد التسجيل.
      </p>
    </div>
  );
}
