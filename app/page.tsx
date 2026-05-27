"use client";

import Link from "next/link";
import { Mail, Cpu, FileText, Clock } from "lucide-react";
import FeatureCard from "../components/landing/FeatureCard";
import PricingCard from "../components/landing/PricingCard";
import FooterLanding from "../components/FooterLanding";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription-tiers";

const features = [
  { title: "AI Screening", desc: "Automated resume scoring and match suggestions.", icon: Cpu },
  { title: "Contract Signing", desc: "Generate and sign offer letters with DocuSeal.", icon: FileText },
  { title: "Mobile Portal", desc: "Applicants and employees use a clean mobile PWA.", icon: Mail },
  { title: "Time Tracking", desc: "Clock in/out with geofencing and attendance logs.", icon: Clock },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_#f0fdf4_0%,_#ffffff_48%,_#f8fafc_100%)] text-slate-900">
      <header className="w-full border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-semibold">Kayod</Link>
          <nav className="hidden sm:flex gap-4">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">Log in</Link>
            <Link href="/register" className="text-sm text-slate-600 hover:text-slate-900">Register</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-12">
        {/* Hero */}
        <section className="text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-4">Hire smarter or find better work faster</h1>
          <p className="text-slate-600 max-w-2xl mx-auto mb-6">AI screening, simple contract signing, and a mobile-first experience that connects employers and candidates seamlessly.</p>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link href="/register" className="inline-flex h-12 items-center justify-center rounded-lg bg-emerald-600 px-5 text-white font-medium hover:bg-emerald-700">I'm hiring</Link>
            <Link href="/apply/jobs" className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-200 px-5 text-slate-700 bg-white hover:bg-gray-50">Find a job</Link>
          </div>
        </section>

        {/* Features */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4 text-center">Platform Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f) => (
              <FeatureCard key={f.title} title={f.title} description={f.desc} Icon={f.icon} />
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4 text-center">Pricing</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {SUBSCRIPTION_TIERS.map((tier) => (
              <PricingCard
                key={tier.plan}
                tier={tier}
                href={`/register?plan=${encodeURIComponent(tier.plan)}`}
                ctaLabel="Get started"
              />
            ))}
          </div>
        </section>
      </main>

      <FooterLanding />
    </div>
  );
}
