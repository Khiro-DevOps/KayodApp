import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const resolvedParams = await searchParams;
  const inviteToken =
    typeof resolvedParams?.invite === "string" ? resolvedParams.invite.trim() : null;

  if (inviteToken) {
    redirect(`/register/hr?invite=${encodeURIComponent(inviteToken)}`);
  }

  redirect("/register/hr");
}