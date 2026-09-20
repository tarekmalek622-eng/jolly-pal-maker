import { supabase } from "@/integrations/supabase/client";

export type RelationType = "couple" | "soulmate" | "favorite_friend" | "close_friend";

export type RelationshipRow = {
  id: string;
  requester_id: string;
  partner_id: string;
  type: RelationType;
  status: "pending" | "accepted" | "rejected" | "ended";
  started_at: string | null;
  created_at: string;
  points: number;
  level: number;
};

export const RELATION_LABELS: Record<RelationType, string> = {
  couple: "ثنائي مميز",
  soulmate: "توأم روح",
  favorite_friend: "صديق مفضل",
  close_friend: "صديق مقرب",
};

export const RELATION_STYLES: Record<RelationType, string> = {
  couple: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  soulmate: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  favorite_friend: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  close_friend: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

export const RELATION_TYPES: RelationType[] = ["couple", "soulmate", "favorite_friend", "close_friend"];

// Generated types lag behind the new table/RPCs.
const anyClient = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function fetchMyRelationships(userId: string, acceptedOnly = false): Promise<RelationshipRow[]> {
  const { data, error } = await anyClient
    .from("relationships")
    .select("id, requester_id, partner_id, type, status, started_at, created_at, points, level")
    .or(`requester_id.eq.${userId},partner_id.eq.${userId}`)
    .in("status", acceptedOnly ? ["accepted"] : ["pending", "accepted"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RelationshipRow[];
}

export async function requestRelationship(partnerId: string, type: RelationType) {
  const { error } = await anyClient.rpc("request_relationship", { _partner_id: partnerId, _type: type });
  if (error) throw new Error(error.message);
}

export async function replaceRelationship(partnerId: string, type: RelationType) {
  const { error } = await supabase.rpc("replace_relationship", { _partner_id: partnerId, _type: type });
  if (error) throw new Error(error.message);
}

export async function respondRelationship(relationshipId: string, accept: boolean) {
  const { error } = await anyClient.rpc("respond_relationship", { _relationship_id: relationshipId, _accept: accept });
  if (error) throw new Error(error.message);
}

export async function endRelationship(relationshipId: string) {
  const { error } = await anyClient.rpc("end_relationship", { _relationship_id: relationshipId });
  if (error) throw new Error(error.message);
}

export function relationDurationLabel(startedAt: string | null) {
  if (!startedAt) return null;
  const days = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000));
  return days === 0 ? "بدأت اليوم" : `${days} يوم`;
}

export type RelationLevel = {
  level: number;
  name: string;
  points: number;
  ring: string;
  badge: string;
  glow: string;
};

// Mirrors app_settings key 'relationships' (server is the source of truth for awarding).
export const RELATION_LEVELS: RelationLevel[] = [
  { level: 1, name: "بذرة الود", points: 0, ring: "border-slate-400/40", badge: "bg-slate-500/20 text-slate-200", glow: "" },
  { level: 2, name: "صداقة دافئة", points: 1_000_000, ring: "border-sky-400/50", badge: "bg-sky-500/20 text-sky-200", glow: "shadow-[0_0_14px_rgba(56,189,248,0.35)]" },
  { level: 3, name: "رابط متين", points: 10_000_000, ring: "border-emerald-400/50", badge: "bg-emerald-500/20 text-emerald-200", glow: "shadow-[0_0_16px_rgba(52,211,153,0.35)]" },
  { level: 4, name: "ثقة عالية", points: 100_000_000, ring: "border-violet-400/50", badge: "bg-violet-500/20 text-violet-200", glow: "shadow-[0_0_18px_rgba(167,139,250,0.4)]" },
  { level: 5, name: "قلبان متحدان", points: 1_000_000_000, ring: "border-rose-400/60", badge: "bg-rose-500/20 text-rose-200", glow: "shadow-[0_0_20px_rgba(251,113,133,0.45)]" },
  { level: 6, name: "رابط أسطوري", points: 10_000_000_000, ring: "border-red-500/60", badge: "bg-red-500/25 text-red-200", glow: "shadow-[0_0_24px_rgba(239,68,68,0.5)]" },
  { level: 7, name: "تاج الأرواح", points: 100_000_000_000, ring: "border-amber-300", badge: "bg-amber-400/25 text-amber-100", glow: "shadow-[0_0_30px_rgba(251,191,36,0.65)]" },
];

export function relationLevelInfo(points: number) {
  const pts = Math.max(0, points || 0);
  let current = RELATION_LEVELS[0]!;
  for (const lvl of RELATION_LEVELS) if (pts >= lvl.points) current = lvl;
  const next = RELATION_LEVELS.find((lvl) => lvl.level === current.level + 1) ?? null;
  const span = next ? next.points - current.points : 0;
  const progress = next ? Math.min(100, Math.round(((pts - current.points) / Math.max(1, span)) * 100)) : 100;
  return { current, next, progress, points: pts, remaining: next ? Math.max(0, next.points - pts) : 0 };
}
