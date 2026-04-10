import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background">
      <div className="w-full max-w-[480px] px-4 py-16 text-center">
        <h1 className="font-(family-name:--font-heading) text-4xl font-bold text-primary mb-3">
          Kayod
        </h1>
        <p className="text-text-secondary text-lg mb-10">
          AI-Assisted Hiring &amp; Onboarding Platform
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-2xl bg-primary text-white font-medium transition-colors hover:bg-primary-dark"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="flex h-12 items-center justify-center rounded-2xl border border-border text-text-primary font-medium transition-colors hover:bg-gray-50"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
