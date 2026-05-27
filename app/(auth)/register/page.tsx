import { Suspense } from "react";
import RegisterWizard from "@/components/auth/register-wizard";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterWizard />
    </Suspense>
  );
}