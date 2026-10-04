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
      <div className="space-y-5">
        <section className="flex flex-col gap-5 rounded-xl bg-card-bg border border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
              <span className="material-symbols-outlined text-2xl">auto_awesome</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">AI Resume Builder</h1>
              <p className="mt-1 text-sm text-text-secondary">Generate a tailored resume for any role.</p>
            </div>
          </div>
          <ResumeBuilderModal resumes={resumes || []} profile={normalizedProfile} />
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section className="rounded-xl bg-card-bg border border-border p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Your Resumes ({resumes?.length ?? 0})</h2>
                <p className="mt-1 text-sm text-text-secondary">Your saved resumes and uploaded files.</p>
              </div>
            </div>
            <ResumeListClient resumes={resumes || []} />
          </section>

          <ResumeUploadClient />
        </div>
      </div>
    </PageContainer>
  );
}
