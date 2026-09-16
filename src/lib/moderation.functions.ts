import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Input = { imageDataUrl: string };

/**
 * Screens a profile photo before it is accepted.
 * Rejects nudity, sexual, or otherwise adult / unsafe imagery.
 */
export const screenProfilePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data?.imageDataUrl?.startsWith("data:image/")) throw new Error("صورة غير صالحة");
    if (data.imageDataUrl.length > 8_000_000) throw new Error("حجم الصورة كبير جدًا");
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { allowed: true, reason: null as string | null, checked: false };

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite",
          messages: [
            {
              role: "system",
              content:
                'You screen profile photos for an Arabic social voice-chat app. Reply with JSON only: {"allowed":boolean,"reason":string}. Set allowed=false for nudity, partial nudity, underwear, sexual or suggestive content, sexual acts, genitalia, gore, violence, hate symbols, or drugs. Ordinary portraits, selfies, avatars, cartoons, landscapes and objects are allowed. reason must be a short Arabic sentence.',
            },
            {
              role: "user",
              content: [
                { type: "text", text: "افحص هذه الصورة." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error("photo screening failed", response.status, await response.text());
        return { allowed: true, reason: null as string | null, checked: false };
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = payload.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { allowed: true, reason: null as string | null, checked: false };
      const verdict = JSON.parse(match[0]) as { allowed?: boolean; reason?: string };
      return {
        allowed: verdict.allowed !== false,
        reason: verdict.reason ?? "الصورة غير مناسبة",
        checked: true,
      };
    } catch (error) {
      console.error("photo screening error", error);
      return { allowed: true, reason: null as string | null, checked: false };
    }
  });
