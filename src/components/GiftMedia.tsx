import { useEffect, useMemo, useRef, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

export type GiftMediaRow = {
  id: string;
  name: string;
  image_url: string | null;
  animation_url: string | null;
  video_url?: string | null;
  thumb_url?: string | null;
  sound_url?: string | null;
  sound_enabled?: boolean | null;
  duration_ms?: number | null;
  display_scale?: number | null;
  rarity?: string | null;
};

/** يحوّل مسارات التخزين إلى روابط قابلة للعرض ويعيد التحميل عند التغيير. */
export function useGiftUrls(gift: GiftMediaRow | null | undefined) {
  const [urls, setUrls] = useState<{ thumb: string | null; anim: string | null; video: string | null; sound: string | null }>({
    thumb: null,
    anim: null,
    video: null,
    sound: null,
  });

  const keys = useMemo(
    () => [gift?.thumb_url ?? gift?.image_url ?? null, gift?.animation_url ?? null, gift?.video_url ?? null, gift?.sound_url ?? null] as const,
    [gift?.thumb_url, gift?.image_url, gift?.animation_url, gift?.video_url, gift?.sound_url],
  );

  useEffect(() => {
    let alive = true;
    void Promise.all(keys.map((k) => resolveMediaUrl(k))).then(([thumb, anim, video, sound]) => {
      if (alive) setUrls({ thumb: thumb ?? null, anim: anim ?? null, video: video ?? null, sound: sound ?? null });
    });
    return () => {
      alive = false;
    };
  }, [keys]);

  return urls;
}

/** صورة الهدية المصغّرة داخل القوائم — تحميل عند الحاجة فقط. */
export function GiftThumb({ gift, size = 48, className }: { gift: GiftMediaRow; size?: number; className?: string }) {
  const [sources, setSources] = useState<string[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      resolveMediaUrl(gift.animation_url),
      resolveMediaUrl(gift.thumb_url ?? gift.image_url),
    ]).then((resolved) => {
      if (!alive) return;
      setSources(resolved.filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index));
      setSourceIndex(0);
    });
    return () => {
      alive = false;
    };
  }, [gift.animation_url, gift.thumb_url, gift.image_url]);

  const src = sources[sourceIndex] ?? null;
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl bg-surface text-lg", className)} style={{ width: size, height: size }}>
        🎁
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={gift.name}
      loading="lazy"
      decoding="async"
      onError={() => setSourceIndex((index) => index + 1)}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * مشغّل تأثير الهدية: يفضّل الفيديو، ثم GIF، ثم الصورة.
 * يحترم مدة العرض وحجم العرض والصوت المحددين من الإدارة.
 */
export function GiftPlayer({
  gift,
  playing = true,
  muted,
  className,
}: {
  gift: GiftMediaRow;
  playing?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const urls = useGiftUrls(gift);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const scale = Math.min(Math.max(gift.display_scale ?? 100, 20), 200) / 100;
  const soundOn = (gift.sound_enabled ?? true) && !muted;

  useEffect(() => {
    setVideoFailed(false);
    setAnimationFailed(false);
  }, [urls.video, urls.anim]);

  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    }
    const a = audioRef.current;
    if (a && soundOn) {
      a.currentTime = 0;
      void a.play().catch(() => undefined);
    }
  }, [playing, urls.video, urls.sound, soundOn]);

  const media = urls.video && !videoFailed ? (
    <video
      ref={videoRef}
      src={urls.video}
      className="h-full w-full object-contain"
      autoPlay={playing}
      muted={!soundOn}
      playsInline
      loop={false}
      preload="none"
      poster={urls.thumb ?? undefined}
      onError={() => setVideoFailed(true)}
    />
  ) : urls.anim && !animationFailed ? (
    <img src={urls.anim} alt={gift.name} className="h-full w-full object-contain" decoding="async" onError={() => setAnimationFailed(true)} />
  ) : urls.thumb ? (
    <img src={urls.thumb} alt={gift.name} className="h-full w-full object-contain" decoding="async" />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-5xl">🎁</div>
  );

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <div className="h-full w-full transition-transform duration-500" style={{ transform: `scale(${scale})` }}>
        {media}
      </div>
      {urls.sound && soundOn ? <audio ref={audioRef} src={urls.sound} preload="none" /> : null}
    </div>
  );
}

export type GiftShowEvent = {
  key: string;
  gift: GiftMediaRow;
  senderName: string;
  receiverName: string;
  quantity: number;
};

/** طبقة عرض تأثير الهدية داخل الغرفة لجميع الحاضرين، واحدة تلو الأخرى. */
export function GiftOverlay({ event, onDone }: { event: GiftShowEvent | null; onDone: () => void }) {
  useEffect(() => {
    if (!event) return;
    const ms = Math.min(Math.max(event.gift.duration_ms ?? 3000, 800), 12000);
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [event, onDone]);

  if (!event) return null;
  const rare = event.gift.rarity === "legendary" || event.gift.rarity === "epic";

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" />
      <div className={cn("relative animate-scale-in", rare && "drop-shadow-[0_0_40px_rgba(255,190,60,0.65)]")}>
        {rare ? (
          <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,196,74,0.35),transparent_65%)] pulse" />
        ) : null}
        <GiftPlayer gift={event.gift} className="h-56 w-56" />
      </div>
      <div className="relative mt-3 max-w-[85vw] rounded-2xl bg-black/55 px-4 py-2 text-center animate-fade-in">
        <p className="text-sm font-bold text-white">
          {event.senderName} ← {event.receiverName}
        </p>
        <p className="text-xs text-amber-300">
          {event.gift.name} ×{event.quantity}
        </p>
      </div>
    </div>
  );
}
