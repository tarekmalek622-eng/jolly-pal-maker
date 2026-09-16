import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

type Props = {
  src?: string | null | undefined;
  name?: string | null | undefined;
  size?: number | undefined;
  vipLevel?: number | undefined;
  frame?: string | null | undefined;
  online?: boolean | undefined;
  className?: string | undefined;
};

export function UserAvatar({ src, name, size = 48, vipLevel = 0, frame, online, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(src).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [src]);

  useEffect(() => {
    let active = true;
    void resolveMediaUrl(frame).then((next) => {
      if (active) setFrameUrl(next);
    });
    return () => {
      active = false;
    };
  }, [frame]);

  const initial = (name ?? "؟").trim().charAt(0);

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <div
        className={cn(
          "h-full w-full overflow-hidden rounded-full bg-surface-2",
          vipLevel > 0 ? "ring-2 ring-primary" : "ring-1 ring-border",
        )}
      >
        {url ? (
          <img src={url} alt={name ?? "صورة المستخدم"} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <span style={{ fontSize: size * 0.4 }}>{initial}</span>
          </div>
        )}
      </div>
      {frameUrl && (
        <img
          src={frameUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -inset-[12%] h-[124%] w-[124%] object-contain"
          loading="lazy"
        />
      )}
      {online != null && (
        <span
          className={cn(
            "absolute bottom-0 start-0 block rounded-full border-2 border-background",
            online ? "bg-success" : "bg-muted-foreground",
          )}
          style={{ width: size * 0.26, height: size * 0.26 }}
        />
      )}
    </div>
  );
}
