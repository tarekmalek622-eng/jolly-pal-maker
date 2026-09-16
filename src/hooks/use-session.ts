import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useSupabaseSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, userId: session?.user?.id ?? null, ready };
}

export type Profile = {
  id: string;
  public_id: string;
  display_name: string;
  country: string | null;
  city: string | null;
  birth_date: string | null;
  gender: "male" | "female" | null;
  bio: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  vip_level: number;
  is_cvip: boolean;
  is_online: boolean;
  last_seen: string;
};

export function useMyProfile(userId: string | null) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
  });
}

export function useWallet(userId: string | null) {
  return useQuery({
    queryKey: ["wallet", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coin_wallets")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { coins: number; total_received: number; total_sent: number } | null;
    },
  });
}

export function useIsAdmin(userId: string | null) {
  return useQuery({
    queryKey: ["is-admin", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
    },
  });
}

export function useRefreshMoney() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["wallet"] });
    void qc.invalidateQueries({ queryKey: ["profile"] });
    void qc.invalidateQueries({ queryKey: ["coin-transactions"] });
  };
}
