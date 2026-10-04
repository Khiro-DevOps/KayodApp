import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PwaSignOutButton } from "@/components/layout/pwa-shell";
import PageContainer from "@/components/ui/page-container";
import EmployeeProfileView from "./_components/EmployeeProfileView";
import type { Profile, Department } from "@/lib/types";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "My Profile | Kayod",
  description: "Manage your personal profile and view employment parameters",
};

export default async function EmployeeProfilePage() {
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
    .maybeSingle<Profile>();

  let { data: employee } = await supabase
    .from("employees")
    .select(`
      *,
      departments ( id, name ),
      office_branches ( id, name, address, latitude, longitude, radius_meters )
    `)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const { data: empByEmail } = await supabase
      .from("employees")
      .select(`
        *,
        departments ( id, name ),
        office_branches ( id, name, address, latitude, longitude, radius_meters )
      `)
      .eq("email", user.email)
      .maybeSingle();
    employee = empByEmail;
  }

  let remoteResidence = null;
  if (employee?.id) {
    const { data: remoteData } = await supabase
      .from("employee_remote_residences")
      .select("*")
      .eq("employee_id", employee.id)
      .maybeSingle();
    remoteResidence = remoteData;
  }

  return (
    <PageContainer>
      <div className="w-full max-w-xl min-w-0 flex flex-col mx-auto px-4 py-6 space-y-5">
        <EmployeeProfileView
          profile={profile ?? null}
          employee={(employee as any) ?? null}
          remoteResidence={remoteResidence}
        />

        <div className="rounded-2xl border border-[#e6e4f0] bg-white p-4 shadow-sm">
          <PwaSignOutButton />
        </div>
      </div>
    </PageContainer>
  );
}
