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
    <HrRegisterFormClient
      inviteToken={inviteToken}
      inviteValidation={inviteValidation}
    />
  );
}
