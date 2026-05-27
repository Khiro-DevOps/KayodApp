"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const pricingSectionRef = useRef<HTMLElement | null>(null);
  const pricingHighlightTimeoutRef = useRef<number | null>(null);
  const pricingResetTimeoutRef = useRef<number | null>(null);
  const [pricingHighlight, setPricingHighlight] = useState(false);

  const handleHiringClick = () => {
    pricingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    if (pricingHighlightTimeoutRef.current) {
      window.clearTimeout(pricingHighlightTimeoutRef.current);
    }

    if (pricingResetTimeoutRef.current) {
      window.clearTimeout(pricingResetTimeoutRef.current);
    }

    pricingHighlightTimeoutRef.current = window.setTimeout(() => {
      setPricingHighlight(true);
    }, 700);

    pricingResetTimeoutRef.current = window.setTimeout(() => {
      setPricingHighlight(false);
    }, 1900);
  };

  useEffect(() => {
    return () => {
      if (pricingHighlightTimeoutRef.current) {
        window.clearTimeout(pricingHighlightTimeoutRef.current);
      }

      if (pricingResetTimeoutRef.current) {
        window.clearTimeout(pricingResetTimeoutRef.current);
      }
    };
  }, []);

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
            <button
              type="button"
              onClick={handleHiringClick}
              className="inline-flex h-12 items-center justify-center rounded-lg bg-emerald-600 px-5 text-white font-medium transition-colors hover:bg-emerald-700"
            >
              I&apos;m hiring
            </button>
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
        <section
          ref={pricingSectionRef}
          id="pricing"
          className="mt-12 scroll-mt-24 sm:scroll-mt-28"
        >
          <h2
            className={`text-xl font-semibold mb-4 text-center transition-all duration-300 ${
              pricingHighlight ? "text-emerald-700 drop-shadow-sm" : "text-slate-900"
            }`}
          >
            Choose Your Plan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {SUBSCRIPTION_TIERS.map((tier) => (
              <div
                key={tier.plan}
                className={`rounded-2xl transition-all duration-300 ${
                  pricingHighlight
                    ? "-translate-y-1 ring-2 ring-emerald-400/50 shadow-[0_16px_50px_rgba(16,185,129,0.14)]"
                    : ""
                }`}
              >
                <PricingCard
                  tier={tier}
                  href={`/register?plan=${encodeURIComponent(tier.plan)}`}
                  ctaLabel="Get started"
                />
              </div>
            ))}
          </div>
        </section>
      </main>

      <FooterLanding />
    </div>
  );
}
