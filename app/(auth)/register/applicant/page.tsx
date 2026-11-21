import { Suspense } from "react";
import { getAdminClient } from "@/lib/supabase/admin";
import { PH_CITIES, PH_PROVINCES } from "@/lib/ph-locations";
import ApplicantRegisterForm, {
  type CityOption,
  type ProvinceOption,
} from "@/components/auth/applicant-register-form";

export default async function ApplicantRegisterPage() {
  let provinces: ProvinceOption[] = [];
  let cities: CityOption[] = [];

  try {
    const admin = getAdminClient();
    const [{ data: dbProvinces }, { data: dbCities }] = await Promise.all([
      admin.from("provinces").select("id, name").order("name").returns<ProvinceOption[]>(),
      admin
        .from("cities")
        .select("id, name, province_id")
        .order("name")
        .returns<CityOption[]>(),
    ]);
    provinces = dbProvinces ?? [];
    cities = dbCities ?? [];
  } catch {
    provinces = [];
    cities = [];
  }

  if (provinces.length === 0 || cities.length === 0) {
    provinces = PH_PROVINCES;
    cities = PH_CITIES;
  }

  return (
    <Suspense>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#FDF8F2]">
        <div className="absolute left-1/2 top-1/2 h-[1120px] w-[1120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] items-center justify-center py-2 sm:py-6">
        <ApplicantRegisterForm
          provinces={provinces}
          cities={cities}
        />
      </div>
    </Suspense>
  );
}
