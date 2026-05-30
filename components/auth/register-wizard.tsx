"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, Cloud, CreditCard, Layers3, Loader2, MapPin, ShieldCheck, Upload, UserRound } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_TIERS, getSubscriptionTier, isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const PAYMENT_DELAY_MS = 1500;

const registerWizardSchema = z
  .object({
    companyName: z.string().trim().min(1, "Company name is required"),
    logoFile: z
      .custom<File>((value) => value instanceof File, {
        message: "Please upload a company logo.",
      })
      .refine((file) => file.type === "image/png" || file.type === "image/jpeg", {
        message: "Logo must be a PNG or JPG file.",
      })
      .refine((file) => file.size <= MAX_LOGO_SIZE_BYTES, {
        message: "Logo must be 2MB or smaller.",
      }),
    adminFullName: z.string().trim().min(1, "HR admin full name is required"),
    email: z.string().trim().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
    headquartersLocation: z.string().trim().min(1, "Headquarters location is required"),
    plan: z.enum(["starter", "growth", "enterprise"]),
    workSetup: z.enum(["onsite", "remote", "hybrid"]),
    cardNumber: z.string().regex(/^\d{16}$/, "Card number must be 16 digits"),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY"),
    cvv: z.string().regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits"),
    cardholderName: z.string().trim().min(1, "Cardholder name is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type RegisterWizardValues = z.infer<typeof registerWizardSchema>;

type RegistrationSummary = {
  companyName: string;
  plan: SubscriptionPlan;
};

type LucideIcon = ComponentType<{ className?: string }>;

const sharedInputClassName =
  "w-full rounded-md border border-[#E8E6F8] bg-white px-3 py-2 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#9A98B3] focus:border-[#332477] focus:ring-1 focus:ring-[#DFDCFF]/50";
const sharedFileInputClassName =
  "block w-full rounded-md border border-dashed border-[#E8E6F8] bg-white px-3 py-2 text-sm text-[#1A1B21] file:mr-3 file:rounded-md file:border-0 file:bg-[#332477] file:px-3 file:py-1.5 file:text-white file:transition-colors hover:file:bg-[#4A3D8F]";
const primaryActionClassName =
  "inline-flex h-10 items-center justify-center rounded-md bg-[#332477] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4A3D8F] disabled:cursor-not-allowed disabled:opacity-70";
const secondaryActionClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#332477] bg-white px-4 text-sm font-semibold text-[#332477] transition-colors hover:bg-[#332477]/5 disabled:cursor-not-allowed disabled:opacity-60";

type StepHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

function StepHeader({ icon: Icon, title, description }: StepHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#DFDCFF] text-[#332477]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#1A1B21]">{title}</h2>
        <p className="text-sm text-[#484551]">{description}</p>
      </div>
    </div>
  );
}

const STEP_1_FIELDS: Array<keyof RegisterWizardValues> = [
  "companyName",
  "logoFile",
  "adminFullName",
  "email",
  "password",
  "confirmPassword",
];

const STEP_2_FIELDS: Array<keyof RegisterWizardValues> = [
  "companyName",
  "headquartersLocation",
  "workSetup",
];

const STEP_3_FIELDS: Array<keyof RegisterWizardValues> = [
  "companyName",
  "logoFile",
  "adminFullName",
  "email",
  "password",
  "confirmPassword",
  "headquartersLocation",
  "plan",
  "workSetup",
  "cardNumber",
  "expiry",
  "cvv",
  "cardholderName",
];

const planNameByValue = new Map(
  SUBSCRIPTION_TIERS.map((tier) => [tier.plan, tier.name] as const)
);

function formatCountdown(seconds: number) {
  return `${Math.max(seconds, 0)}s`;
}

export default function RegisterWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [registrationSummary, setRegistrationSummary] = useState<RegistrationSummary | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<RegisterWizardValues>({
    resolver: zodResolver(registerWizardSchema),
    mode: "onTouched",
    defaultValues: {
      companyName: "",
      adminFullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      headquartersLocation: "",
      plan: "starter",
      workSetup: "hybrid",
      cardNumber: "",
      expiry: "",
      cvv: "",
      cardholderName: "",
    },
  });

  const selectedPlan = watch("plan");
  const selectedWorkSetup = watch("workSetup");
  const logoFile = watch("logoFile");
  const companyName = watch("companyName");
  const adminFullName = watch("adminFullName");

  useEffect(() => {
    const queryPlan = searchParams.get("plan");
    const initialPlan: SubscriptionPlan = isSubscriptionPlan(queryPlan) ? queryPlan : "starter";
    setValue("plan", initialPlan, { shouldDirty: false, shouldTouch: false, shouldValidate: true });
  }, [searchParams, setValue]);

  useEffect(() => {
    if (!(logoFile instanceof File)) {
      setLogoPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [logoFile]);

  useEffect(() => {
    if (step !== 4 || !registrationSummary) {
      return;
    }

    setRedirectCountdown(3);
    const interval = window.setInterval(() => {
      setRedirectCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          router.replace("/dashboard");
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [registrationSummary, router, step]);

  async function goToPlanStep() {
    setSubmissionError(null);
    const isValid = await trigger(STEP_1_FIELDS);
    if (isValid) {
      setStep(2);
    }
  }

  async function goToPaymentStep() {
    setSubmissionError(null);
    const isValid = await trigger(STEP_2_FIELDS);
    if (isValid) {
      setStep(3);
    }
  }

  async function submitRegistration(values: RegisterWizardValues) {
    const formData = new FormData();
    formData.append("companyName", values.companyName);
    formData.append("adminFullName", values.adminFullName);
    formData.append("email", values.email);
    formData.append("password", values.password);
    formData.append("confirmPassword", values.confirmPassword);
    formData.append("plan", values.plan);
    formData.append("cardNumber", values.cardNumber);
    formData.append("expiry", values.expiry);
    formData.append("cvv", values.cvv);
    formData.append("cardholderName", values.cardholderName);
    formData.append("logoFile", values.logoFile);

    const response = await fetch("/api/register/hr", {
      method: "POST",
      body: formData,
    });

    // Defensive parsing: some server errors return HTML (eg. Next dev overlay)
    // which causes `response.json()` to throw with 'Unexpected token <'.
    const text = await response.text();
    let payload: { error?: string; simulated?: boolean } | null = null;

    try {
      payload = JSON.parse(text) as { error?: string; simulated?: boolean };
    } catch (parseErr) {
      // Surface the non-JSON response (trimmed) for easier debugging.
      const snippet = text?.slice(0, 1000) ?? "";
      throw new Error(`Server returned non-JSON response: ${snippet}`);
    }

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to create the HR account.");
    }

    // If the server returned a simulated response (e.g. local dev without
    // Supabase admin credentials), skip the Supabase client sign-in and
    // continue the onboarding flow using the simulated data.
    if (payload.simulated) {
      setRegistrationSummary({
        companyName: values.companyName,
        plan: values.plan,
      });
      setStep(4);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (signInError) {
      throw new Error(signInError.message);
    }

    setRegistrationSummary({
      companyName: values.companyName,
      plan: values.plan,
    });
    setStep(4);
  }

  const paymentSubmit = handleSubmit(async (values) => {
    const isValid = await trigger(STEP_3_FIELDS);
    if (!isValid) {
      return;
    }

    setPaymentInProgress(true);
    setSubmissionError(null);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_DELAY_MS));
      await submitRegistration(values);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Unable to complete registration.");
    } finally {
      setPaymentInProgress(false);
    }
  });

  const currentTier = getSubscriptionTier(selectedPlan);
  const selectedPlanLabel = planNameByValue.get(selectedPlan) ?? currentTier.name;

  return (
    <div className="min-h-screen bg-[#ececf2] px-3 py-4 sm:px-4 lg:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1380px] overflow-hidden rounded-[32px] border-[4px] border-[#cfd0dc] bg-[#f5f2fb] shadow-[0_18px_52px_rgba(23,18,46,0.18)]">
        <aside className="flex w-[39%] flex-col justify-between bg-[#3b2a86] px-12 py-12 text-white sm:px-14">
          <div>
            <div className="mb-20 text-lg font-extrabold tracking-tight">Kayod</div>
            <div className="max-w-sm space-y-5">
              <h2 className="text-[32px] font-bold leading-[1.05] tracking-tight">
                Build Your Custom Workspace Panel
              </h2>
              <p className="max-w-[320px] text-sm leading-6 text-white/75">
                Establish the digital foundation of your organization. Define legal entities, headquarters, and work protocols to tailor the Kayod experience to your team.
              </p>
            </div>
          </div>

          <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            Kayod HR Enterprise Infrastructure Suite © 2026
          </p>
        </aside>

        <main className="relative flex w-[61%] items-center justify-center bg-[#faf8ff] px-10 py-12 sm:px-14">
          <div className="w-full max-w-[760px]">
            <div className="rounded-[10px] border border-[#d9d4ea] bg-white px-6 py-6 shadow-[0_3px_12px_rgba(50,41,106,0.08)]">
              <nav className="mb-5 flex items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-2 text-[#332477]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#332477] bg-white text-[11px] font-semibold">1</div>
                  <span className="font-semibold">Account</span>
                </div>
                <div className="h-px flex-1 bg-[#d8d3ea]" />
                <div className="flex items-center gap-2 text-[#332477]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#332477] text-[11px] font-semibold text-white">2</div>
                  <span className="font-semibold">Company Details</span>
                </div>
                <div className="h-px flex-1 bg-[#d8d3ea]" />
                <div className="flex items-center gap-2 text-[#9b97b3]">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d0cadf] bg-white text-[10px]">3</div>
                  <span>Workspace</span>
                </div>
              </nav>

              {submissionError ? (
                <div className="mb-4 rounded-md border border-[#F4C6C6] bg-[#FFF3F3] px-3 py-2 text-sm text-[#B42318]">
                  {submissionError}
                </div>
              ) : null}

              <div className="mb-5">
                <h3 className="text-[18px] font-semibold text-[#1a1b21]">Configure Operational Structure</h3>
                <p className="text-sm text-[#484551]">Set up legal entity, headquarters and default work setup.</p>
              </div>

              <div>
              {step === 1 ? (
                <section className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Company Name</label>
                      <input id="companyName" type="text" autoComplete="organization" placeholder="Acme Corporation" className={sharedInputClassName} {...register("companyName")} />
                      {errors.companyName ? <p className="text-xs text-[#B42318]">{errors.companyName.message}</p> : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Full Name</label>
                      <input id="adminFullName" type="text" autoComplete="name" placeholder="Juan Dela Cruz" className={sharedInputClassName} {...register("adminFullName")} />
                      {errors.adminFullName ? <p className="text-xs text-[#B42318]">{errors.adminFullName.message}</p> : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Email</label>
                      <input id="email" type="email" autoComplete="email" placeholder="hr@company.com" className={sharedInputClassName} {...register("email")} />
                      {errors.email ? <p className="text-xs text-[#B42318]">{errors.email.message}</p> : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Logo</label>
                      <Controller
                        control={control}
                        name="logoFile"
                        render={({ field }) => (
                          <input id="logoFile" type="file" accept="image/png,image/jpeg" className={sharedFileInputClassName} onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) { field.onChange(undefined); clearErrors("logoFile"); return; }
                            if (!(file.type === "image/png" || file.type === "image/jpeg")) { setError("logoFile", { type: "manual", message: "Logo must be a PNG or JPG file." }); event.target.value = ""; field.onChange(undefined); return; }
                            if (file.size > MAX_LOGO_SIZE_BYTES) { setError("logoFile", { type: "manual", message: "Logo must be 2MB or smaller." }); event.target.value = ""; field.onChange(undefined); return; }
                            clearErrors("logoFile"); field.onChange(file);
                          }} ref={field.ref} name={field.name} />
                        )}
                      />
                      {errors.logoFile ? <p className="text-xs text-[#B42318]">{errors.logoFile.message as string}</p> : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={goToPlanStep} className={primaryActionClassName}>Continue to Preferences</button>
                  </div>
                </section>
              ) : null}

              {step === 2 ? (
                <section className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-[#1A1B21]">Legal Entity Name</label>
                    <input id="companyName_step2" type="text" placeholder="e.g. Nexus Global Technologies Inc." className={sharedInputClassName} {...register("companyName")} />
                    {errors.companyName ? <p className="text-xs text-[#B42318]">{errors.companyName.message}</p> : null}
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-[#1A1B21]">Corporate Headquarters Location</label>
                    <div className="relative">
                      <input id="headquartersLocation" type="text" placeholder="Search city or enter address" className={sharedInputClassName + " pl-10"} {...register("headquartersLocation")} />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A98B3]" />
                    </div>
                    {errors.headquartersLocation ? <p className="text-xs text-[#B42318]">{errors.headquartersLocation.message}</p> : null}
                  </div>

                  <div>
                    <span className="font-label-caps text-[11px] font-bold uppercase tracking-wider text-[#61607D] block mb-3">DEFAULT WORK SETUP INDICATOR</span>
                    <div className="grid grid-cols-3 gap-3">
                      <button type="button" onClick={() => setValue("workSetup", "onsite", { shouldDirty: true })} className={"rounded-lg p-3 border transition-colors " + (selectedWorkSetup === "onsite" ? "border-[#332477] bg-[#FAF8FF]" : "border-[#E8E6F8] bg-white") }>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 flex items-center justify-center rounded bg-[#F7F5FF]"><Layers3 className="text-[#332477]" /></div>
                          <div className="text-sm font-medium">On-site</div>
                        </div>
                      </button>

                      <button type="button" onClick={() => setValue("workSetup", "remote", { shouldDirty: true })} className={"rounded-lg p-3 border transition-colors " + (selectedWorkSetup === "remote" ? "border-[#332477] bg-[#FAF8FF]" : "border-[#E8E6F8] bg-white") }>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 flex items-center justify-center rounded bg-[#F7F5FF]"><Cloud className="text-[#332477]" /></div>
                          <div className="text-sm font-medium">Remote</div>
                        </div>
                      </button>

                      <button type="button" onClick={() => setValue("workSetup", "hybrid", { shouldDirty: true })} className={"rounded-lg p-3 border transition-colors " + (selectedWorkSetup === "hybrid" ? "border-[#332477] bg-[#FAF8FF]" : "border-[#E8E6F8] bg-white") }>
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-10 h-10 flex items-center justify-center rounded bg-[#F7F5FF]"><Layers3 className="text-[#332477]" /></div>
                          <div className="text-sm font-medium">Hybrid</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setStep(1)} className={secondaryActionClassName}><ArrowLeft className="h-4 w-4" /> Back</button>
                    <button type="button" onClick={goToPaymentStep} className={primaryActionClassName}>Continue to Preferences</button>
                  </div>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Cardholder Name</label>
                      <input id="cardholderName" type="text" autoComplete="cc-name" placeholder="Juan Dela Cruz" className={sharedInputClassName} {...register("cardholderName")} />
                      {errors.cardholderName ? <p className="text-xs text-[#B42318]">{errors.cardholderName.message}</p> : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Card Number</label>
                      <input id="cardNumber" inputMode="numeric" maxLength={16} placeholder="1234567812345678" className={sharedInputClassName} {...register("cardNumber")} />
                      {errors.cardNumber ? <p className="text-xs text-[#B42318]">{errors.cardNumber.message}</p> : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">Expiry (MM/YY)</label>
                      <input id="expiry" inputMode="numeric" placeholder="08/29" className={sharedInputClassName} {...register("expiry")} />
                      {errors.expiry ? <p className="text-xs text-[#B42318]">{errors.expiry.message}</p> : null}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-[#1A1B21]">CVV</label>
                      <input id="cvv" inputMode="numeric" maxLength={4} placeholder="123" className={sharedInputClassName} {...register("cvv")} />
                      {errors.cvv ? <p className="text-xs text-[#B42318]">{errors.cvv.message}</p> : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button type="button" onClick={() => setStep(2)} disabled={paymentInProgress} className={secondaryActionClassName}><ArrowLeft className="h-4 w-4" /> Back</button>
                    <button type="button" onClick={paymentSubmit} disabled={paymentInProgress} className={primaryActionClassName}>{paymentInProgress ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Processing payment...</span> : "Pay Now"}</button>
                  </div>
                </section>
              ) : null}

              {step === 4 ? (
                <section className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#332477] shadow-sm">
                    <CheckCircle2 className="h-4 w-4" /> Account created successfully
                  </div>
                  <h3 className="text-lg font-bold">Welcome, {adminFullName || "HR admin"}</h3>
                  <p className="text-sm text-[#484551]">{companyName || "Your company"} is now registered on the {selectedPlanLabel} plan.</p>
                  <p className="text-sm">Redirecting to your dashboard in {formatCountdown(redirectCountdown)}</p>
                </section>
              ) : null}
            </div>

              <div className="mt-5 flex items-center justify-center gap-10 text-[11px] uppercase tracking-[0.16em] text-[#8a879e]">
                <span>ISO 27001 Certified</span>
                <span>Enterprise Encryption</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <p className="mt-5 text-center text-sm text-[#61607D]">
        Looking for work? <a className="text-[#4A3D8F] hover:underline" href="/apply">Sign up as an Applicant instead</a>
      </p>
    </div>
  );
}