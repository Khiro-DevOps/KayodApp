import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import { PwaSignOutButton } from "@/components/layout/pwa-shell";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, roleLabel, isCandidateRole } from "@/lib/roles";
import ProfileDetailsForm from "./profile-details-form";
import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function deriveMetadataName(metadata: Record<string, unknown>, rawMetadata: Record<string, unknown>, email?: string | null): string {
  const firstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const lastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) return combined;

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) return fullName;

  return normalizeName((email ?? "").split("@")[0]).replace(/[._-]+/g, " ") || "";
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const authPhone = ((user.user_metadata?.phone ?? rawMetadata.phone) as string | undefined) ?? "";
  const { firstName: derivedFirstName, lastName: derivedLastName } = (() => {
    const first = normalizeName(metadata.first_name ?? rawMetadata.first_name);
    const last = normalizeName(metadata.last_name ?? rawMetadata.last_name);
    if (first || last) return { firstName: first, lastName: last };

    const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
    if (fullName) {
      const [firstFromFull, ...rest] = fullName.split(/\s+/);
      return {
        firstName: firstFromFull ?? "",
        lastName: rest.join(" "),
      };
    }

    const fallback = normalizeName((user.email ?? "").split("@")[0]).replace(/[._-]+/g, " ").trim();
    return {
      firstName: fallback || "User",
      lastName: "",
    };
  })();

  let resolvedProfile = profile;
  try {
    const currentFirst = normalizeName(profile?.first_name);
    const currentLast = normalizeName(profile?.last_name);
    const shouldSync = (derivedFirstName || derivedLastName) && (currentFirst !== derivedFirstName || currentLast !== derivedLastName);

    if (profile?.id && shouldSync) {
      const admin = getAdminClient();
      const { error: updateError } = await admin
        .from("profiles")
        .update({ first_name: derivedFirstName, last_name: derivedLastName })
        .eq("id", profile.id);

      if (!updateError) {
        resolvedProfile = {
          ...profile,
          first_name: derivedFirstName,
          last_name: derivedLastName,
        };
      }
    }
  } catch {
    // Non-blocking: page still renders with fallback name.
  }

  const displayEmail = profile?.email || user.email || "No email";
  const profileName = `${resolvedProfile?.first_name?.trim() || ""} ${resolvedProfile?.last_name?.trim() || ""}`.trim();
  const metadataName = deriveMetadataName(metadata, rawMetadata, user.email);
  const displayName = profileName || metadataName || displayEmail.split("@")[0] || "Unknown User";
  const displayPhone = resolvedProfile?.phone || authPhone || "No phone number";

  const effective = effectiveRole(resolvedProfile?.role, authRole);

  if (!isCandidateRole(effective)) {
    redirect("/hr");
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PwaHeroBanner
          title={displayName}
          subtitle={displayEmail}
          avatar={
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-xl font-bold text-white">
              {displayName.charAt(0).toUpperCase() || "?"}
            </div>
          }
          badge={
            <span className="inline-flex w-fit items-center rounded-full border border-white/20 bg-white/15 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              {roleLabel(effective)}
            </span>
          }
        />

        {/* Responsive 2-Column Desktop Layout */}
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 px-4 sm:px-6 lg:grid-cols-12 lg:px-10">
          {/* Left Column: Account Summary + Links + Sign Out */}
          <div className="space-y-6 lg:col-span-5">
            <SolidSurfaceCard className="space-y-4 p-5 sm:p-6">
              <h2 className="text-base font-bold text-[#1E1B4B]">Account Details</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3.5">
                  <p className="text-xs text-text-secondary">Name</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1E1B4B]">{displayName}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3.5">
                  <p className="text-xs text-text-secondary">Email</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1E1B4B] break-all">{displayEmail}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3.5">
                  <p className="text-xs text-text-secondary">Phone Number</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1E1B4B]">{displayPhone}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 border border-slate-100 p-3.5">
                  <p className="text-xs text-text-secondary">Account Type</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-[#1E1B4B]">
                    {roleLabel(effective)}
                  </p>
                </div>
              </div>
            </SolidSurfaceCard>

            {isCandidateRole(effective) && (
              <Link
                href="/applicant/resume"
                className="flex items-center justify-between rounded-3xl border border-slate-200/80 bg-white p-4 text-sm font-semibold text-[#1E1B4B] shadow-xs transition-colors hover:border-[#1E1B4B]/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-[#1E1B4B]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
                    </svg>
                  </div>
                  My Resumes
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-secondary">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                </svg>
              </Link>
            )}

            <SolidSurfaceCard className="p-4">
              <PwaSignOutButton />
            </SolidSurfaceCard>
          </div>

          {/* Right Column: Editable Personal & Location Details */}
          <div className="lg:col-span-7">
            <ProfileDetailsForm profile={resolvedProfile ?? null} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
