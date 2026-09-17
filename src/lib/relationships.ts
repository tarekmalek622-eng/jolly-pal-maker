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
    .select("id, requester_id, partner_id, type, status, started_at, created_at")
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
