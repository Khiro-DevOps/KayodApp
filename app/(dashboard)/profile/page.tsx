import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/app/(auth)/actions";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <PageContainer>
      <div className="space-y-6">
        <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
          Profile
        </h1>

        {/* User Info Card */}
        <div className="rounded-2xl bg-surface border border-border p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-medium text-text-primary">
                {profile?.full_name}
              </p>
              <p className="text-sm text-text-secondary">{profile?.email}</p>
            </div>
          </div>

          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-text-secondary">Role</p>
            <p className="text-sm font-medium text-text-primary capitalize">
              {profile?.role?.replace("_", " ")}
            </p>
          </div>
        </div>

        {/* Logout */}
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-2xl border border-danger py-3 text-sm font-medium text-danger transition-colors hover:bg-red-50"
          >
            Log Out
          </button>
        </form>
      </div>
    </PageContainer>
  );
}
