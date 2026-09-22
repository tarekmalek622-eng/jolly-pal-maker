import { useEffect, useState } from "react";
import { Moon, Sun, Type } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "normal", label: "عادي" },
  { key: "large", label: "كبير" },
  { key: "xlarge", label: "أكبر" },
] as const;

/** مظهر التطبيق: حجم الخط لسهولة القراءة، محفوظ على الجهاز. */
export function AppearanceSettings() {
  const [size, setSize] = useState<string>("normal");
  const [mode, setMode] = useState<string>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("taj:fs") ?? "normal";
    setSize(saved);
    document.documentElement.dataset["fs"] = saved;
    const savedMode = window.localStorage.getItem("taj:mode") ?? "dark";
    setMode(savedMode);
    document.documentElement.classList.toggle("light", savedMode === "light");
  }, []);

  function applyMode(next: string) {
    setMode(next);
    window.localStorage.setItem("taj:mode", next);
    document.documentElement.classList.toggle("light", next === "light");
  }

  function apply(next: string) {
    setSize(next);
    window.localStorage.setItem("taj:fs", next);
    document.documentElement.dataset["fs"] = next;
  }

  return (
    <>
    <section className="surface-card mt-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15">
          {mode === "light" ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-primary" />}
        </span>
        <div>
          <p className="text-sm font-black">الوضع</p>
          <p className="text-[10px] text-muted-foreground">اختر الوضع النهاري أو الليلي</p>
        </div>
      </div>
      <div className="flex gap-2">
        {[
          { key: "dark", label: "ليلي" },
          { key: "light", label: "نهاري" },
        ].map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => applyMode(m.key)}
            className={cn(
              "flex-1 rounded-2xl border px-3 py-2 text-[11px] font-bold",
              mode === m.key ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-surface",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </section>
    <section className="surface-card mt-4 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15">
          <Type className="h-4 w-4 text-primary" />
        </span>
        <div>
          <p className="text-sm font-black">حجم الخط</p>
          <p className="text-[10px] text-muted-foreground">اختر الحجم الأنسب لعينك</p>
        </div>
      </div>
      <div className="flex gap-2">
        {SIZES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => apply(s.key)}
            className={cn(
              "flex-1 rounded-2xl border px-3 py-2 text-[11px] font-bold",
              size === s.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 bg-surface",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </section>
    </>
  );
}
