import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Gamepad2, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/home", label: "الرئيسية", icon: Home },
  { to: "/games", label: "الألعاب", icon: Gamepad2 },
  { to: "/messages", label: "الرسائل", icon: MessageCircle },
  { to: "/me", label: "حسابي", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed bottom-0 start-0 end-0 z-40 mx-auto max-w-lg">
      <div className="glass safe-bottom mx-3 mb-2 flex items-center justify-between rounded-3xl px-2 pt-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
