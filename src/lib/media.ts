import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

/** Resolves a stored storage path (`bucket/path`) into a temporary viewable URL. */
export async function resolveMediaUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http")) return stored;

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
