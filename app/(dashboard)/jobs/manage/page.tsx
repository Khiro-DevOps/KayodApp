import { redirect } from "next/navigation";

export default function ManageJobsRedirect() {
  redirect("/hr/jobs/manage");
}