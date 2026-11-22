import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Resume, Profile } from "@/lib/types";
import ResumeListClient from "./resume-list-client";
import ResumeUploadClient from "./resume-upload-client";
import ResumeBuilderModal, { type ResumePrefill } from "./resume-builder-modal";
import { effectiveRole, isCandidateRole } from "@/lib/roles";
import { PH_CITIES, PH_PROVINCES } from "@/lib/ph-locations";

function getAuthPhone(user: { user_metadata?: unknown; raw_user_meta_data?: unknown }) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const possiblePhone =
    metadata.phone ??
    metadata.phone_number ??
    rawMetadata.phone ??
    rawMetadata.phone_number;

  return typeof possiblePhone === "string" ? possiblePhone.trim() : "";
}

function formatEmailHandle(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function lookupStaticCityName(cityId: string | null | undefined): string {
  if (!cityId) return "";
  return PH_CITIES.find((c) => c.id === cityId)?.name ?? "";
}

function lookupStaticProvinceName(provinceId: string | null | undefined): string {
  if (!provinceId) return "";
  return PH_PROVINCES.find((p) => p.id === provinceId)?.name ?? "";
}

import { SolidSurfaceCard } from "@/components/ui/option-b-surfaces";
import PwaHeroBanner from "@/components/pwa/PwaHeroBanner";

export const dynamic = "force-dynamic";

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

  const { data: profileData } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profileRecord = (profileData ?? null) as (Partial<Profile> & {
    full_name?: string | null;
    province?: string | null;
    city_id?: string | null;
    province_id?: string | null;
  }) | null;

  const authPhone = getAuthPhone(rawUser);

  if (
    profileRecord &&
    (!profileRecord.phone || profileRecord.phone.trim().length === 0) &&
    authPhone.length > 0
  ) {
    await admin
      .from("profiles")
      .update({ phone: authPhone })
      .eq("id", user.id);

    profileRecord.phone = authPhone;
  }

  const metaStr = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string).trim() : "";

  const resolvedFirstName = profileRecord?.first_name?.trim() || metaStr("first_name");
  const resolvedLastName = profileRecord?.last_name?.trim() || metaStr("last_name");
  const resolvedFullName =
    profileRecord?.full_name?.trim() ||
    `${resolvedFirstName} ${resolvedLastName}`.trim() ||
    metaStr("full_name") ||
    metaStr("name") ||
    formatEmailHandle(profileRecord?.email || rawUser.email);

  const resolvedEmail = profileRecord?.email?.trim() || rawUser.email?.trim() || "";
  const resolvedPhone =
    (profileRecord?.phone && profileRecord.phone.trim().length > 0
      ? profileRecord.phone.trim()
      : authPhone) || "";

  const rawCityId = profileRecord?.city_id?.trim() || metaStr("city_id") || null;
  const rawProvinceId = profileRecord?.province_id?.trim() || metaStr("province_id") || null;

  let resolvedCity =
    profileRecord?.city?.trim() ||
    metaStr("city") ||
    lookupStaticCityName(rawCityId);
  let resolvedProvince =
    profileRecord?.province?.trim() ||
    metaStr("province") ||
    lookupStaticProvinceName(rawProvinceId);

  const uuidIds = [rawCityId, rawProvinceId].filter(
    (id): id is string =>
      Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  );

  if (uuidIds.length > 0 && (!resolvedCity || !resolvedProvince)) {
    const { data: locationRows } = await admin
      .from("locations")
      .select("id, name, location_type")
      .in("id", uuidIds);

    for (const loc of locationRows ?? []) {
      if (loc.id === rawCityId && !resolvedCity && loc.name) {
        resolvedCity = loc.name.trim();
      }
      if (loc.id === rawProvinceId && !resolvedProvince && loc.name) {
        resolvedProvince = loc.name.trim();
      }
    }
  }

  const resolvedAddress = profileRecord?.address?.trim() || metaStr("address") || "";
  const resolvedCountry = profileRecord?.country?.trim() || metaStr("country") || "Philippines";

  const resolvedLocation = (() => {
    if (resolvedCity && resolvedProvince) return `${resolvedCity}, ${resolvedProvince}`;
    if (resolvedCity && resolvedCountry) return `${resolvedCity}, ${resolvedCountry}`;
    if (resolvedAddress && resolvedCity) return `${resolvedAddress}, ${resolvedCity}`;
    if (resolvedAddress && resolvedProvince) return `${resolvedAddress}, ${resolvedProvince}`;
    if (resolvedProvince && resolvedCountry) return `${resolvedProvince}, ${resolvedCountry}`;
    return resolvedAddress || resolvedCity || resolvedProvince || resolvedCountry;
  })();

  const normalizedProfile: Profile = {
    id: profileRecord?.id ?? user.id,
    role: (profileRecord?.role ?? (authRole || "candidate")) as Profile["role"],
    first_name: resolvedFirstName,
    last_name: resolvedLastName,
    full_name: resolvedFullName,
    email: resolvedEmail,
    phone: resolvedPhone,
    avatar_url: profileRecord?.avatar_url ?? null,
    date_of_birth: profileRecord?.date_of_birth ?? (metaStr("date_of_birth") || null),
    age: profileRecord?.age ?? null,
    address: resolvedAddress || null,
    city: resolvedCity || null,
    country: resolvedCountry,
    city_id: rawCityId,
    province_id: rawProvinceId,
    created_at: profileRecord?.created_at ?? new Date().toISOString(),
    updated_at: profileRecord?.updated_at ?? new Date().toISOString(),
  };

  const prefill: ResumePrefill = {
    fullName: resolvedFullName,
    email: resolvedEmail,
    phone: resolvedPhone,
    location: resolvedLocation,
  };

  const role = effectiveRole(normalizedProfile?.role, authRole);
  if (!isCandidateRole(role)) {
    redirect(role === "employee" ? "/employee/dashboard" : "/hr");
  }

  // Fetch user's resumes
  const { data: resumes } = await admin
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
          actions={
            <ResumeBuilderModal
              resumes={resumes || []}
              profile={normalizedProfile}
              prefill={prefill}
            />
          }
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
