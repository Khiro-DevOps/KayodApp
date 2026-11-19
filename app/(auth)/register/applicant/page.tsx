import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ApplicantRegisterForm, {
  type CityOption,
  type ProvinceOption,
} from "@/components/auth/applicant-register-form";

export default async function ApplicantRegisterPage() {
  const supabase = await createClient();

  const [{ data: provinces }, { data: cities }] = await Promise.all([
    supabase.from("provinces").select("id, name").order("name").returns<ProvinceOption[]>(),
    supabase
      .from("cities")
      .select("id, name, province_id")
      .order("name")
      .returns<CityOption[]>(),
  ]);

  return (
    <Suspense>
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center py-2 sm:py-6">
        <ApplicantRegisterForm
          provinces={provinces ?? []}
          cities={cities ?? []}
        />
      </div>
    </Suspense>
  );
}
