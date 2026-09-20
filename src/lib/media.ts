import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

/** Resolves a stored storage path (`bucket/path`) into a temporary viewable URL. */
export async function resolveMediaUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http")) return stored;
  if (stored.startsWith("/")) return stored;

  const cached = cache.get(stored);
  if (cached && cached.expires > Date.now()) return cached.url;

  const slash = stored.indexOf("/");
  if (slash < 1) return null;
  const bucket = stored.slice(0, slash);
  const path = stored.slice(slash + 1);

  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(stored, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

export async function uploadUserImage(
  bucket: "avatars" | "rooms",
  userId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  return `${bucket}/${path}`;
}

/* ---------------- رفع ملفات الهدايا (صور / GIF / فيديو / صوت) ---------------- */

export const GIFT_MEDIA_TYPES = {
  image: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
} as const;

export type GiftMediaKind = keyof typeof GIFT_MEDIA_TYPES;

/** حد حجم الملف (ميجابايت) — قابل للتعديل من إعدادات الإدارة. */
export const GIFT_MEDIA_MAX_MB = 50;
/** أقصى دقة مسموحة للصور (ميجابكسل). */
export const GIFT_IMAGE_MAX_MEGAPIXELS = 75;

export type UploadHandle = {
  promise: Promise<string>;
  cancel: () => void;
};

export function uploadGiftMedia(
  kind: GiftMediaKind,
  file: File,
  onProgress?: (percent: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const allowed = GIFT_MEDIA_TYPES[kind] as readonly string[];
    if (!allowed.includes(file.type)) throw new Error("نوع الملف غير مدعوم");
    if (file.size <= 0) throw new Error("الملف تالف أو فارغ");
    if (file.size > GIFT_MEDIA_MAX_MB * 1024 * 1024)
      throw new Error(`أقصى حجم للملف ${GIFT_MEDIA_MAX_MB} ميجابايت`);

    if (kind === "image" && file.type !== "image/gif") {
      const px = await imagePixels(file).catch(() => 0);
      if (px > GIFT_IMAGE_MAX_MEGAPIXELS * 1_000_000)
        throw new Error(`أقصى دقة للصورة ${GIFT_IMAGE_MAX_MEGAPIXELS} ميجابكسل`);
    }

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("انتهت الجلسة، أعد تسجيل الدخول");

    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const base = import.meta.env['VITE_SUPABASE_URL'] as string;
    const apikey = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;

    return await new Promise<string>((resolve, reject) => {
      xhr.open("POST", `${base}/storage/v1/object/gifts/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", apikey);
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve(`gifts/${path}`);
        } else {
          reject(new Error(`فشل الرفع (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("فشل الرفع، تحقق من الاتصال"));
      xhr.onabort = () => reject(new Error("تم إلغاء الرفع"));
      xhr.send(file);
    });
  })();

  return { promise, cancel: () => xhr.abort() };
}

function imagePixels(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth * img.naturalHeight);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("صورة غير صالحة"));
    };
    img.src = url;
  });
}
