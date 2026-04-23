import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { effectiveRole, isHRRole, roleLabel } from "@/lib/roles";

export default async function HRDashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
  
  const { data: profile } = await supabase
  .from('profiles')
  .select(`
    *,
    tenants (
      name
    )
  `)
  .eq('id', user.id)
  .single();

const companyName = profile?.tenants?.name || "Your Company";

  const effective = effectiveRole(profile?.role, authRole);
  if (!isHRRole(effective)) redirect("/dashboard");

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : "HR Manager";

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">HR Dashboard</h1>
          <p className="text-text-secondary">Manage your HR operations and workforce</p>
        </div>

        {/* HR Tools Grid */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Job Postings */}
          <Link href="/jobs/manage">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">📋</div>
                <h3 className="font-semibold text-lg">Job Postings</h3>
                <p className="text-sm text-text-secondary">Create and manage job openings</p>
              </div>
            </div>
          </Link>

          {/* Applications */}
          <Link href="/applications">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">📨</div>
                <h3 className="font-semibold text-lg">Applications</h3>
                <p className="text-sm text-text-secondary">Review candidate applications</p>
              </div>
            </div>
          </Link>

          {/* Interviews */}
          <Link href="/interviews">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">📞</div>
                <h3 className="font-semibold text-lg">Interviews</h3>
                <p className="text-sm text-text-secondary">Schedule and conduct interviews</p>
              </div>
            </div>
          </Link>

          {/* Employees */}
          <Link href="/employees">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">👥</div>
                <h3 className="font-semibold text-lg">Employees</h3>
                <p className="text-sm text-text-secondary">Manage employee information</p>
              </div>
            </div>
          </Link>

          {/* Payroll */}
          <Link href="/payroll">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">💰</div>
                <h3 className="font-semibold text-lg">Payroll</h3>
                <p className="text-sm text-text-secondary">Manage payroll and compensation</p>
              </div>
            </div>
          </Link>

          {/* Schedules */}
          <Link href="/schedules">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">📅</div>
                <h3 className="font-semibold text-lg">Schedules</h3>
                <p className="text-sm text-text-secondary">View and manage work schedules</p>
              </div>
            </div>
          </Link>

          {/* More */}
          <Link href="/hr/more">
            <div className="rounded-2xl bg-surface border border-border p-6 hover:border-primary/50 transition-colors cursor-pointer h-full">
              <div className="space-y-2">
                <div className="text-3xl">⚙️</div>
                <h3 className="font-semibold text-lg">More</h3>
                <p className="text-sm text-text-secondary">Additional HR tools and settings</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
