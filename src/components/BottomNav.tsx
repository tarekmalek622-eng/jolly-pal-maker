import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, Compass, Mic, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCrownUnread } from "@/lib/crown.functions";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseSession } from "@/hooks/use-session";

const items = [
  { to: "/home", label: "الرئيسية", icon: Home },
  { to: "/rooms", label: "الغرف", icon: Mic },
  { to: "/games", label: "الاستكشاف", icon: Compass },
  { to: "/messages", label: "الرسائل", icon: MessageCircle },
  { to: "/me", label: "حسابي", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { userId } = useSupabaseSession();
  const fetchUnread = useServerFn(getCrownUnread);
  const unread = useQuery({
    queryKey: ["crown-unread", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await fetchUnread();
      } catch {
        return { unread: 0 };
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const notifUnread = useQuery({
    queryKey: ["notifications-unread", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const hasCrown = (unread.data?.unread ?? 0) > 0 || (notifUnread.data ?? 0) > 0;

  return (
    <nav className="fixed bottom-0 start-0 end-0 z-40 mx-auto max-w-lg">
      <div className="glass safe-bottom mx-3 mb-2 flex items-center justify-between rounded-3xl px-2 pt-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          const dot = to === "/messages" && hasCrown;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                {dot && (
                  <span className="absolute -end-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
