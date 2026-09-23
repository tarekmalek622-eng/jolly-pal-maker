import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_suspended")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.is_suspended) throw redirect({ to: "/" });

    return { user: data.user };
  },
  component: () => (
    <>
      <MaintenanceBanner />
      <Outlet />
    </>
  ),
});
