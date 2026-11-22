import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { PwaSignOutButton } from "@/components/layout/pwa-shell";
import PageContainer from "@/components/ui/page-container";
import EmployeeProfileView from "./_components/EmployeeProfileView";
import { getJobPostingPositionForProfile } from "@/lib/employee-position-server";
import { resolveEmployeeSourceOfTruth } from "@/lib/work-arrangement";
import type { Profile, OfficeBranch, Employee, Department } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  const admin = getAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  let { data: employee } = await admin
    .from("employees")
    .select(`
      *,
      departments ( id, name ),
      office_branches ( id, name, address, latitude, longitude, radius_meters )
    `)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!employee && user.email) {
    const { data: empByEmail } = await admin
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
    const { data: remoteData } = await admin
      .from("employee_remote_residences")
      .select("*")
      .eq("employee_id", employee.id)
      .maybeSingle();
    remoteResidence = remoteData;
  }

  const linkedJob = await getJobPostingPositionForProfile(user.id);

  // If employee's work_location_id points to a branch not joined (or linkedJob has one), fetch via admin
  type EmployeeWithRelations = Employee & {
    departments?: Department | null;
    office_branches?: OfficeBranch | OfficeBranch[] | null;
  };
  const empTyped = employee as EmployeeWithRelations | null;
  let officeBranch: OfficeBranch | null = Array.isArray(empTyped?.office_branches)
    ? empTyped.office_branches[0] ?? null
    : empTyped?.office_branches ?? null;

  const branchId = linkedJob?.workLocationId ?? employee?.work_location_id ?? null;
  if (!officeBranch && branchId) {
    const { data: branchRow } = await admin
      .from("office_branches")
      .select("id, name, address, latitude, longitude, radius_meters")
      .eq("id", branchId)
      .maybeSingle<OfficeBranch>();
    officeBranch = branchRow ?? null;
  }

  const sourceOfTruth = resolveEmployeeSourceOfTruth({
    employee,
    offer: linkedJob
      ? {
        job_title: linkedJob.offerTitle,
        work_setup: linkedJob.offerWorkSetup,
      }
      : null,
    jobPosting: linkedJob
      ? {
        title: linkedJob.title,
        department: linkedJob.departmentName,
        work_setup: linkedJob.jobWorkSetup,
      }
      : null,
    officeBranch,
    remoteResidence,
  });

  return (
    <PageContainer>
      <div className="w-full min-w-0 flex flex-col">
        <EmployeeProfileView
          profile={profile ?? null}
          employee={empTyped}
          remoteResidence={remoteResidence}
          officeBranch={officeBranch}
          linkedJobTitle={linkedJob?.title ?? null}
          linkedJobDepartment={linkedJob?.departmentName ?? null}
          linkedWorkMode={sourceOfTruth.workSetup}
          resolvedPosition={sourceOfTruth.position}
          resolvedDepartment={sourceOfTruth.department}
          resolvedWorkSetupLabel={sourceOfTruth.workSetupLabel}
          resolvedAssignedLocation={sourceOfTruth.assignedLocation}
        />

        <div className="mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-10">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <PwaSignOutButton />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
