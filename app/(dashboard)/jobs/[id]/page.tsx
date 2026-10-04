import { redirect } from "next/navigation";

export default async function LegacyJobDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/applicant/jobs/${id}`);
}
