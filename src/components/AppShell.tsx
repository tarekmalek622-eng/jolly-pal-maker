import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";
import { BadgeStrip } from "@/components/BadgeStrip";
import { useSupabaseSession, useMyProfile } from "@/hooks/use-session";

export function AppShell({
  children,
  header,
  hideNav,
}: {
  children: ReactNode;
  header?: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col">
        {header}
        <main className="flex-1 px-4 pb-28 pt-2">{children}</main>
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { userId } = useSupabaseSession();
  const profile = useMyProfile(userId);
  
  return (
    <header className="sticky top-0 z-30 bg-background/85 px-4 pb-4 pt-6 backdrop-blur-xl">
      <div className="absolute top-1 start-4">
        <BadgeStrip userId={userId} rank={profile.data?.level ?? 1} count={0} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="surface-card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}
