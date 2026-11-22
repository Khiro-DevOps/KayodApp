import { Suspense } from "react";
import Link from "next/link";
import RegisterWizard from "@/components/auth/register-wizard";
import HrRegisterFormClient from "./hr/hr-register-form-client";
import { validateHrInviteToken } from "./hr/actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const resolvedParams = await searchParams;
  const inviteToken =
    typeof resolvedParams?.invite === "string" ? resolvedParams.invite.trim() : null;

  if (inviteToken) {
    const inviteValidation = await validateHrInviteToken(inviteToken);
    return (
      <HrRegisterFormClient
        inviteToken={inviteToken}
        inviteValidation={inviteValidation}
      />
    );
  }

  return (
    <>
      <Suspense>
        <RegisterWizard />
      </Suspense>

      <div className="mt-6 text-center">
        <p className="text-sm text-text-secondary">
          Looking for work? <Link href="/register/applicant" className="font-medium text-primary">Sign up as an Applicant instead</Link>
        </p>
      </div>
    </>
  );
}