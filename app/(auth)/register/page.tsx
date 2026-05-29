import { Suspense } from "react";
import Link from "next/link";
import RegisterWizard from "@/components/auth/register-wizard";

export default function RegisterPage() {
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