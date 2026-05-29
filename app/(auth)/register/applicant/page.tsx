import { Suspense } from "react";
import ApplicantRegisterForm from "@/components/auth/applicant-register-form";

export default function ApplicantRegisterPage() {
  return (
    <Suspense>
      <div className="mx-auto w-full max-w-[420px]">
        <ApplicantRegisterForm />
      </div>
    </Suspense>
  );
}
