import { createClient } from "@/lib/supabase/server";
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

export default async function ResumePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawUser = user as { user_metadata?: Record<string, unknown>; raw_user_meta_data?: Record<string, unknown> };
  const authRole = (rawUser.user_metadata?.role ?? rawUser.raw_user_meta_data?.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, age, address, city, country, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const authPhone = getAuthPhone(rawUser);

  if (profile && (!profile.phone || profile.phone.trim().length === 0) && authPhone.trim().length > 0) {
    await supabase
      .from("profiles")
      .update({ phone: authPhone.trim() })
      .eq("id", user.id);

    profile.phone = authPhone.trim();
  }

  const normalizedProfile: Profile | null = profile
    ? {
        ...profile,
        age: profile.age ?? null,
        phone: profile.phone && profile.phone.trim().length > 0 ? profile.phone : authPhone || null,
      }
    : null;

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
      <div className="mx-auto max-w-[1400px] space-y-6">
        <section className="-mx-6 -mt-8 rounded-b-[2rem] bg-[#1E1B4B] px-6 pt-6 pb-8 text-white shadow-[0_12px_30px_rgba(30,27,75,0.16)] md:mx-0 md:mt-0 md:rounded-3xl md:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Resumes &amp; AI Builder
              </h1>
              <p className="mt-1 text-sm text-white/75">
                Build tailored resumes with AI or upload your PDF for instant job matching
              </p>
            </div>
            <ResumeBuilderModal resumes={resumes || []} profile={normalizedProfile} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Saved Resumes</p>
              <p className="mt-1 text-xl font-bold text-[#1E1B4B] sm:text-2xl">{resumes?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white p-3.5 text-slate-900 shadow-sm">
              <p className="text-xs font-medium text-slate-500">AI Matching</p>
              <p className="mt-1 text-sm font-bold text-emerald-700 sm:text-base">Ready</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
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
