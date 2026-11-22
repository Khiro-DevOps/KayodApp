import HrRegisterFormClient from "./hr-register-form-client";
import { validateHrInviteToken } from "./actions";

export const dynamic = "force-dynamic";

export default async function HrRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const resolvedParams = await searchParams;
  const inviteToken = typeof resolvedParams?.invite === "string" ? resolvedParams.invite.trim() : null;
  const inviteValidation = inviteToken ? await validateHrInviteToken(inviteToken) : null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#FDF8F2]">
        <div className="absolute left-1/2 top-1/2 h-[1120px] w-[1120px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
        <div className="absolute left-1/2 top-1/2 h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-900/[0.06]" />
      </div>
      <div className="relative z-10 flex min-h-[calc(100vh-3rem)] items-center justify-center py-2 sm:py-6">
        <HrRegisterFormClient
          inviteToken={inviteToken}
          inviteValidation={inviteValidation}
        />
      </div>
    </>
  );
}
