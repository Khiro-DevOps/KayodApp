import { redirect } from "next/navigation";

export default async function ReviewBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/hr/jobs/${id}/applicants`);
}