import { redirect } from "next/navigation";

export default async function HrJobDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/jobs/${encodeURIComponent(id)}/applicants`);
}
