import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Resume, Profile } from "@/lib/types";
import Link from "next/link";
import ResumeBuilderClient from "./resume-builder-client";
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

  const authRole = (user.user_metadata as any)?.role ?? ((user as any).raw_user_meta_data as any)?.role;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, address, city, country, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  const authPhone = getAuthPhone(user as any);
  const normalizedProfile: Profile | null = profile
    ? {
        ...profile,
        phone: profile.phone && profile.phone.trim().length > 0 ? profile.phone : authPhone || null,
      }
    : null;

  const role = effectiveRole(normalizedProfile?.role, authRole);
  if (!isCandidateRole(role)) redirect("/dashboard");

  // Fetch user's resumes
  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("candidate_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  return (
    <div className="flex gap-6">
      {/* Your Resumes Sidebar */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4 space-y-4">
          <div className="rounded-2xl bg-surface border border-border p-4">
            <h2 className="text-sm font-semibold text-text-primary mb-3">
              Your Resumes ({resumes?.length ?? 0})
            </h2>
            {!resumes || resumes.length === 0 ? (
              <p className="text-xs text-text-secondary">No resumes yet</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {resumes.map((resume) => (
                  <div
                    key={resume.id}
                    className="rounded-xl border-2 border-border bg-surface p-3 hover:border-primary/30"
                  >
                    <p className="truncate text-sm font-medium text-text-primary">
                      {resume.title || "Untitled Resume"}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(resume.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <PageContainer>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
                </svg>
              </Link>
              <div className="min-w-0 flex-1">
                <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
                  Resume Builder
                </h1>
                <p className="text-sm text-text-secondary">
                  Create AI-powered, ATS-friendly resumes or upload existing ones
                </p>
              </div>
            </div>

            <ResumeBuilderClient resumes={resumes || []} profile={normalizedProfile} />
          </div>
        </PageContainer>
      </div>
    </div>
  );
}
