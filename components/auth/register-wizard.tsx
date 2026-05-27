"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, CreditCard, Loader2, ShieldCheck, Upload, UserRound } from "lucide-react";
import { z } from "zod";
import PricingCard from "@/components/landing/PricingCard";
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
    plan: z.enum(["starter", "growth", "enterprise"]),
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

const STEP_1_FIELDS: Array<keyof RegisterWizardValues> = [
  "companyName",
  "logoFile",
  "adminFullName",
  "email",
  "password",
  "confirmPassword",
];

const STEP_3_FIELDS: Array<keyof RegisterWizardValues> = [
  "companyName",
  "logoFile",
  "adminFullName",
  "email",
  "password",
  "confirmPassword",
  "plan",
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
      plan: "starter",
      cardNumber: "",
      expiry: "",
      cvv: "",
      cardholderName: "",
    },
  });

  const selectedPlan = watch("plan");
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
    const isValid = await trigger(["plan"]);
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

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "Failed to create the HR account.");
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
    <div className="w-full space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-sm backdrop-blur sm:p-8">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">HR tenant registration</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Create your Kayod company account</h1>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600">
            Complete the four-step onboarding flow to set up your company, pick a subscription tier, and simulate payment before your HR dashboard opens.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Step {step} of 4</span>
            <span>{Math.round((step / 4) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {submissionError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submissionError}
          </div>
        )}

        {step === 4 ? (
          <div className="mt-8 grid gap-6 rounded-3xl bg-emerald-50 p-6 sm:grid-cols-[1.3fr_0.7fr] sm:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
                <CheckCircle2 className="h-4 w-4" />
                Account created successfully
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">Welcome, {adminFullName || "HR admin"}</h2>
                <p className="text-slate-700">
                  {companyName || "Your company"} is now registered on the {selectedPlanLabel} plan.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Company</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{companyName}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{currentTier.name}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                Redirecting to your dashboard in {formatCountdown(redirectCountdown)}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>Company name: {companyName}</p>
                <p>Plan tier: {currentTier.name}</p>
                <p>Auth status: active</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {step === 1 && (
              <section className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">Company info</h2>
                        <p className="text-sm text-slate-600">Upload your logo and name your company.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="companyName">
                        Company Name
                      </label>
                      <input
                        id="companyName"
                        type="text"
                        autoComplete="organization"
                        placeholder="Acme Corporation"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        {...register("companyName")}
                      />
                      {errors.companyName && <p className="text-sm text-red-600">{errors.companyName.message}</p>}
                    </div>

                    <div className="space-y-3">
                      <label className="text-sm font-medium text-slate-700" htmlFor="logoFile">
                        Company logo
                      </label>
                      <Controller
                        control={control}
                        name="logoFile"
                        render={({ field }) => (
                          <input
                            id="logoFile"
                            type="file"
                            accept="image/png,image/jpeg"
                            className="block w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-white file:transition-colors hover:file:bg-emerald-700"
                            onChange={(event) => {
                              const file = event.target.files?.[0];

                              if (!file) {
                                field.onChange(undefined);
                                clearErrors("logoFile");
                                return;
                              }

                              if (!(file.type === "image/png" || file.type === "image/jpeg")) {
                                setError("logoFile", {
                                  type: "manual",
                                  message: "Logo must be a PNG or JPG file.",
                                });
                                event.target.value = "";
                                field.onChange(undefined);
                                return;
                              }

                              if (file.size > MAX_LOGO_SIZE_BYTES) {
                                setError("logoFile", {
                                  type: "manual",
                                  message: "Logo must be 2MB or smaller.",
                                });
                                event.target.value = "";
                                field.onChange(undefined);
                                return;
                              }

                              clearErrors("logoFile");
                              field.onChange(file);
                            }}
                            ref={field.ref}
                            name={field.name}
                          />
                        )}
                      />
                      {errors.logoFile && <p className="text-sm text-red-600">{errors.logoFile.message as string}</p>}

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        {logoPreviewUrl ? (
                          <div className="flex items-center gap-4">
                            <Image
                              src={logoPreviewUrl}
                              alt="Company logo preview"
                              width={64}
                              height={64}
                              className="h-16 w-16 rounded-2xl border border-slate-200 object-cover"
                            />
                            <div className="text-sm text-slate-600">
                              <p className="font-medium text-slate-900">Logo preview ready</p>
                              <p>PNG or JPG under 2MB.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            <Upload className="h-5 w-5" />
                            Select a logo to preview it instantly before submitting.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">HR admin account</h2>
                        <p className="text-sm text-slate-600">Create the login for your team lead.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="adminFullName">
                        Full Name
                      </label>
                      <input
                        id="adminFullName"
                        type="text"
                        autoComplete="name"
                        placeholder="Juan Dela Cruz"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        {...register("adminFullName")}
                      />
                      {errors.adminFullName && <p className="text-sm text-red-600">{errors.adminFullName.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700" htmlFor="email">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="hr@company.com"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        {...register("email")}
                      />
                      {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="password">
                          Password
                        </label>
                        <input
                          id="password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Minimum 8 characters"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          {...register("password")}
                        />
                        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                          Confirm Password
                        </label>
                        <input
                          id="confirmPassword"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Repeat password"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          {...register("confirmPassword")}
                        />
                        {errors.confirmPassword && <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={goToPlanStep}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Next: Plan Selector
                  </button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Choose your subscription plan</h2>
                    <p className="text-sm text-slate-600">The tier from the landing page is preselected and can be changed here.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {SUBSCRIPTION_TIERS.map((tier) => (
                    <PricingCard
                      key={tier.plan}
                      tier={tier}
                      selected={selectedPlan === tier.plan}
                      onSelect={(plan) => {
                        setValue("plan", plan, { shouldValidate: true, shouldDirty: true });
                      }}
                      ctaLabel={selectedPlan === tier.plan ? "Selected" : "Choose plan"}
                    />
                  ))}
                </div>

                <input type="hidden" value={selectedPlan} {...register("plan")} />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Selected tier:</span> {currentTier.name} ({currentTier.price})
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={goToPaymentStep}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    Next: Payment
                  </button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Simulated payment</h2>
                    <p className="text-sm text-slate-600">This step always succeeds after a 1.5 second loading state.</p>
                  </div>
                </div>

                <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="cardholderName">
                      Cardholder Name
                    </label>
                    <input
                      id="cardholderName"
                      type="text"
                      autoComplete="cc-name"
                      placeholder="Juan Dela Cruz"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      {...register("cardholderName")}
                    />
                    {errors.cardholderName && <p className="text-sm text-red-600">{errors.cardholderName.message}</p>}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="cardNumber">
                      Card Number
                    </label>
                    <input
                      id="cardNumber"
                      inputMode="numeric"
                      maxLength={16}
                      placeholder="1234567812345678"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      {...register("cardNumber")}
                    />
                    {errors.cardNumber && <p className="text-sm text-red-600">{errors.cardNumber.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="expiry">
                      Expiry (MM/YY)
                    </label>
                    <input
                      id="expiry"
                      inputMode="numeric"
                      placeholder="08/29"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      {...register("expiry")}
                    />
                    {errors.expiry && <p className="text-sm text-red-600">{errors.expiry.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700" htmlFor="cvv">
                      CVV
                    </label>
                    <input
                      id="cvv"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="123"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                      {...register("cvv")}
                    />
                    {errors.cvv && <p className="text-sm text-red-600">{errors.cvv.message}</p>}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Current checkout summary</p>
                  <p className="mt-2">Company: {companyName || "Not yet entered"}</p>
                  <p>Plan: {currentTier.name}</p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={paymentInProgress}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={paymentSubmit}
                    disabled={paymentInProgress}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {paymentInProgress ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing payment...
                      </span>
                    ) : (
                      "Pay Now"
                    )}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}