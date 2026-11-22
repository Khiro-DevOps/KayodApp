import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Resume, Profile } from "@/lib/types";
import ResumeListClient from "./resume-list-client";
import ResumeUploadClient from "./resume-upload-client";
import ResumeBuilderModal from "./resume-builder-modal";
import { effectiveRole, isCandidateRole } from "@/lib/roles";

function getAuthPhone(user: { user_metadata?: unknown; raw_user_meta_data?: unknown }) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const possiblePhone =
    metadata.phone ??
    metadata.phone_number ??
    rawMetadata.phone ??
    rawMetadata.phone_number;

  return typeof possiblePhone === "string" ? possiblePhone : "";
}

import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";

export default async function ResumePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawUser = user as {
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    raw_user_meta_data?: Record<string, unknown>;
  };
  const meta = {
    ...(rawUser.raw_user_meta_data ?? {}),
    ...(rawUser.user_metadata ?? {}),
  };
  const authRole = meta.role as string | undefined;
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, age, address, city, country, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const authPhone = getAuthPhone(rawUser);

  if (profile && (!profile.phone || profile.phone.trim().length === 0) && authPhone.trim().length > 0) {
    await admin
      .from("profiles")
      .update({ phone: authPhone.trim() })
      .eq("id", user.id);

    profile.phone = authPhone.trim();
  }

  const metaStr = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string).trim() : "";

  const normalizedProfile: Profile = {
    id: profile?.id ?? user.id,
    role: (profile?.role ?? (authRole || "candidate")) as Profile["role"],
    first_name: profile?.first_name?.trim() || metaStr("first_name"),
    last_name: profile?.last_name?.trim() || metaStr("last_name"),
    email: profile?.email?.trim() || rawUser.email || "",
    phone:
      (profile?.phone && profile.phone.trim().length > 0 ? profile.phone.trim() : authPhone) || "",
    avatar_url: profile?.avatar_url ?? null,
    date_of_birth: profile?.date_of_birth ?? (metaStr("date_of_birth") || null),
    age: profile?.age ?? null,
    address: profile?.address?.trim() || metaStr("address") || null,
    city: profile?.city?.trim() || metaStr("city") || null,
    country: profile?.country?.trim() || metaStr("country") || "Philippines",
    created_at: profile?.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? new Date().toISOString(),
  };

  const role = effectiveRole(normalizedProfile?.role, authRole);
  if (!isCandidateRole(role)) {
    redirect(role === "employee" ? "/employee/dashboard" : "/hr");
  }

  // Fetch user's resumes
  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          title="Resumes & AI Builder"
          subtitle="Build tailored resumes with AI or upload your PDF for instant job matching"
          actions={<ResumeBuilderModal resumes={resumes || []} profile={normalizedProfile} />}
        >
          <div className="grid grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Saved Resumes</p>
              <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{resumes?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">AI Matching</p>
              <p className="mt-1 text-sm font-bold text-emerald-700 sm:text-base">Ready</p>
            </div>
          </div>
        </PwaHeroBanner>

        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:px-10">
          <SolidSurfaceCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#1E1B4B]">Your Resumes ({resumes?.length ?? 0})</h2>
                <p className="mt-1 text-sm text-text-secondary">Your saved resumes and uploaded files.</p>
              </div>
            </div>
            <ResumeListClient resumes={resumes || []} />
          </SolidSurfaceCard>

          <SolidSurfaceCard className="p-5 sm:p-6">
            <ResumeUploadClient />
          </SolidSurfaceCard>
        </div>
      </div>
    </PageContainer>
  );
}
