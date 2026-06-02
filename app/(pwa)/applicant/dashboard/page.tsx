"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { effectiveRole } from "@/lib/roles";
import type { Profile, UserRole } from "@/lib/types";

import ApplicantDashboardView from "./applicant-dashboard-view";

type DashboardProfile = Pick<Profile, "role" | "tenant_id" | "first_name" | "last_name" | "email" | "avatar_url">;

type DashboardIdentity = {
  userId: string;
  profile: DashboardProfile | null;
  role: UserRole;
};

function getDisplayName(profile: DashboardProfile | null) {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile?.email?.split("@")[0] || "there";
}

export default function DashboardPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<DashboardIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadIdentity = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (!user) {
          router.replace("/login");
          return;
        }

        const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
        const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, tenant_id, first_name, last_name, email, avatar_url")
          .eq("id", user.id)
          .maybeSingle<DashboardProfile>();

        if (!isMounted) {
          return;
        }

        setIdentity({
          userId: user.id,
          profile: profile ?? null,
          role: effectiveRole(profile?.role, authRole),
        });
        setIsLoading(false);
      } catch (err) {
        console.error("loadIdentity error:", err);
        if (isMounted) {
          setError("Unable to load identity.");
          setIsLoading(false);
        }
      }
    };

    void loadIdentity();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (isLoading || !identity) {
    return (
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-6 py-6 text-sm text-outline">
        Loading dashboard...
      </div>
    );
  }

  if (identity.role === "employee") {
    router.replace("/employee/dashboard");
    return null;
  }

  if (identity.role === "hr_manager" || identity.role === "admin") {
    router.replace("/hr");
    return null;
  }

  return <ApplicantDashboardView identity={identity} displayName={getDisplayName(identity.profile)} />;
}