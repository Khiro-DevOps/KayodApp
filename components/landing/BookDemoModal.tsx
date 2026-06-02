"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";

type BookDemoFormState = {
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string;
  dateOfBirth: string;
  age: string;
  jobTitle: string;
  companyName: string;
  industry: string;
  companySize: string;
  workSetup: string;
  address: string;
  city: string;
  country: string;
  monthlyHiringVolume: string;
  problemToSolve: string;
  password: string;
  confirmPassword: string;
  workspaceSlug: string;
};

type RegistrationResponse = {
  success: boolean;
  userId?: string;
  tenantId?: string;
  workspaceSlug?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  teamSize?: string;
};

const INDUSTRY_OPTIONS = [
  "BPO/Outsourcing",
  "Banking & Finance",
  "Retail & E-commerce",
  "Healthcare",
  "Manufacturing",
  "Technology",
  "Government",
  "Other",
];

const COMPANY_SIZE_OPTIONS = ["50–200", "200–1,000", "1,000–5,000", "5,000+"];

const MONTHLY_HIRING_VOLUME_OPTIONS = ["1–10", "10–50", "50–200", "200+"];
const WORK_SETUP_OPTIONS = ["onsite", "remote", "hybrid", "wfh"];

function slugifyCompanyName(companyName: string) {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function BookDemoModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isWorkspaceSlugManuallyEdited, setIsWorkspaceSlugManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [registrationSummary, setRegistrationSummary] = useState<RegistrationResponse | null>(null);
  const [formData, setFormData] = useState<BookDemoFormState>({
    firstName: "",
    lastName: "",
    workEmail: "",
    phone: "",
    dateOfBirth: "",
    age: "",
    jobTitle: "",
    companyName: "",
    industry: "",
    companySize: "",
    workSetup: "",
    address: "",
    city: "",
    country: "",
    monthlyHiringVolume: "",
    problemToSolve: "",
    password: "",
    confirmPassword: "",
    workspaceSlug: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setIsWorkspaceSlugManuallyEdited(false);
      setIsSubmitting(false);
      setSubmitError(null);
      setRegistrationSummary(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isWorkspaceSlugManuallyEdited) {
      return;
    }

    const nextSlug = slugifyCompanyName(formData.companyName);
    setFormData((current) =>
      current.workspaceSlug === nextSlug
        ? current
        : {
            ...current,
            workspaceSlug: nextSlug,
          }
    );
  }, [formData.companyName, isWorkspaceSlugManuallyEdited]);

  if (!mounted) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-[8px] bg-[#332477] px-3.5 py-2.5 font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-white transition-all hover:bg-[#4A3D8F] active:scale-95"
      >
        Book a Demo
      </button>
    );
  }

  const steps = ["1", "2", "3", "4"];

  const updateField = <K extends keyof BookDemoFormState>(field: K, value: BookDemoFormState[K]) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleBack = () => {
    if (registrationSummary) {
      return;
    }

    setCurrentStep((step) => Math.max(1, step - 1));
  };

  const handleSubmitRegistration = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formDataPayload = new FormData();
      formDataPayload.set("firstName", formData.firstName);
      formDataPayload.set("lastName", formData.lastName);
      formDataPayload.set("workEmail", formData.workEmail);
      formDataPayload.set("phone", formData.phone);
      formDataPayload.set("date_of_birth", formData.dateOfBirth);
      formDataPayload.set("age", formData.age);
      formDataPayload.set("jobTitle", formData.jobTitle);
      formDataPayload.set("companyName", formData.companyName);
      formDataPayload.set("tenant_name", formData.companyName);
      formDataPayload.set("industry", formData.industry);
      formDataPayload.set("companySize", formData.companySize);
      formDataPayload.set("work_setup", formData.workSetup);
      formDataPayload.set("address", formData.address);
      formDataPayload.set("city", formData.city);
      formDataPayload.set("country", formData.country);
      formDataPayload.set("monthlyHiringVolume", formData.monthlyHiringVolume);
      formDataPayload.set("problemToSolve", formData.problemToSolve);
      formDataPayload.set("password", formData.password);
      formDataPayload.set("confirmPassword", formData.confirmPassword);
      formDataPayload.set("workspaceSlug", formData.workspaceSlug);

      const response = await fetch("/api/register/hr", {
        method: "POST",
        body: formDataPayload,
      });

      const payloadText = await response.text();
      if (!response.ok) {
        // log raw server response for debugging (dev only)
        try {
          // eslint-disable-next-line no-console
          console.error("[BookDemoModal] server response (non-ok):", payloadText.slice(0, 2000));
        } catch {}
      }
      let parsed: RegistrationResponse | null = null;

      try {
        parsed = JSON.parse(payloadText) as RegistrationResponse;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const cleaned = payloadText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
        const message = cleaned ? `Server error: ${cleaned}` : `Server error: ${response.status} ${response.statusText}`;
        throw new Error(message);
      }

      if (parsed && !parsed.success) {
        throw new Error(parsed?.email ? `Registration failed for ${parsed.email}` : parsed?.error || "Failed to create your workspace.");
      }

      setRegistrationSummary({
        success: true,
        userId: parsed?.userId,
        tenantId: parsed?.tenantId,
        workspaceSlug: parsed?.workspaceSlug ?? formData.workspaceSlug,
        firstName: parsed?.firstName ?? formData.firstName,
        lastName: parsed?.lastName ?? formData.lastName,
        email: parsed?.email ?? formData.workEmail,
        companyName: parsed?.companyName ?? formData.companyName,
        teamSize: parsed?.teamSize ?? formData.companySize,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error ?? "Unable to complete registration.");
      const cleaned = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const message = cleaned.length > 300 ? `${cleaned.slice(0, 300)}...` : cleaned;
      setSubmitError(message || "Unable to complete registration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (registrationSummary) {
      return;
    }

    if (currentStep < 4) {
      setCurrentStep((step) => step + 1);
      return;
    }

    await handleSubmitRegistration();
  };

  const fullName = [registrationSummary?.firstName ?? formData.firstName, registrationSummary?.lastName ?? formData.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-[8px] bg-[#332477] px-3.5 py-2.5 font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-white transition-all hover:bg-[#4A3D8F] active:scale-95"
      >
        Book a Demo
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 py-4 sm:px-6 sm:py-6">
              <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
                <div className="flex items-center justify-between border-b border-[#E8E6F8] px-5 py-4">
                  <div>
                    <h3 className="font-[family-name:var(--font-poppins)] text-[20px] font-semibold text-[#1A1B21]">
                      Book a demo
                    </h3>
                    <p className="mt-1 text-sm text-[#484551]">Step {currentStep} of 4</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E8E6F8] text-[#484551] transition-colors hover:bg-[#FAF8FF]"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="border-b border-[#E8E6F8] px-5 py-4">
                  <div className="flex items-center gap-2">
                    {steps.map((step) => {
                      const stepNumber = Number(step);
                      const isActive = stepNumber === currentStep;
                      const isCompleted = stepNumber < currentStep;

                      return (
                        <div
                          key={step}
                          className={`flex h-3.5 flex-1 rounded-full transition-colors ${
                            isCompleted || isActive ? "bg-[#332477]" : "bg-[#E8E6F8]"
                          }`}
                          aria-label={`Step ${step}`}
                          title={`Step ${step}`}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[#61607D]">
                    {steps.map((step) => {
                      const stepNumber = Number(step);
                      const isActive = stepNumber === currentStep;
                      const isCompleted = stepNumber < currentStep;

                      return (
                        <span
                          key={step}
                          className={`flex-1 text-center font-medium ${
                            isActive || isCompleted ? "text-[#332477]" : "text-[#61607D]"
                          }`}
                        >
                          {step}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6">
                  {registrationSummary ? (
                    <div className="space-y-5">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[#F0FDF4] px-3 py-2 text-sm font-semibold text-[#166534]">
                        <CheckCircle2 className="h-4 w-4" /> Workspace created successfully
                      </div>

                      <div className="space-y-3 rounded-2xl border border-[#E8E6F8] bg-[#FAF8FF] p-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[#61607D]">Name</p>
                          <p className="mt-1 text-sm font-semibold text-[#1A1B21]">{fullName || "Your team"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[#61607D]">Email</p>
                          <p className="mt-1 text-sm font-semibold text-[#1A1B21]">{registrationSummary.email || formData.workEmail}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[#61607D]">Company</p>
                          <p className="mt-1 text-sm font-semibold text-[#1A1B21]">{registrationSummary.companyName || formData.companyName}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-[#61607D]">Team size</p>
                          <p className="mt-1 text-sm font-semibold text-[#1A1B21]">{registrationSummary.teamSize || formData.companySize}</p>
                        </div>
                      </div>

                      <p className="text-sm text-[#484551]">
                        Your workspace is ready. Use the button below to continue into the app.
                      </p>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => router.replace("/dashboard")}
                          className="rounded-[8px] bg-[#332477] px-4 py-2.5 font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-white transition-colors hover:bg-[#4A3D8F]"
                        >
                          Go to Dashboard
                        </button>
                      </div>
                    </div>
                  ) : currentStep === 1 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        First name
                        <input
                          type="text"
                          value={formData.firstName}
                          onChange={(event) => updateField("firstName", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Last name
                        <input
                          type="text"
                          value={formData.lastName}
                          onChange={(event) => updateField("lastName", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21] sm:col-span-2">
                        Work email
                        <input
                          type="email"
                          value={formData.workEmail}
                          onChange={(event) => updateField("workEmail", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Phone
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(event) => updateField("phone", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Date of birth
                        <input
                          type="date"
                          value={formData.dateOfBirth}
                          onChange={(event) => updateField("dateOfBirth", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Age
                        <input
                          type="number"
                          min="0"
                          value={formData.age}
                          onChange={(event) => updateField("age", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21] sm:col-span-2">
                        Job title
                        <input
                          type="text"
                          value={formData.jobTitle}
                          onChange={(event) => updateField("jobTitle", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                    </div>
                  ) : currentStep === 2 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21] sm:col-span-2">
                        Tenant / company name
                        <input
                          type="text"
                          value={formData.companyName}
                          onChange={(event) => {
                            updateField("companyName", event.target.value);
                          }}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Industry
                        <select
                          value={formData.industry}
                          onChange={(event) => updateField("industry", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors focus:border-[#332477]"
                        >
                          <option value="">Select industry</option>
                          {INDUSTRY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Company size
                        <select
                          value={formData.companySize}
                          onChange={(event) => updateField("companySize", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors focus:border-[#332477]"
                        >
                          <option value="">Select company size</option>
                          {COMPANY_SIZE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : currentStep === 3 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21] sm:col-span-2">
                        Address
                        <input
                          type="text"
                          value={formData.address}
                          onChange={(event) => updateField("address", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        City
                        <input
                          type="text"
                          value={formData.city}
                          onChange={(event) => updateField("city", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Country
                        <input
                          type="text"
                          value={formData.country}
                          onChange={(event) => updateField("country", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Monthly hiring volume
                        <select
                          value={formData.monthlyHiringVolume}
                          onChange={(event) => updateField("monthlyHiringVolume", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors focus:border-[#332477]"
                        >
                          <option value="">Select monthly hiring volume</option>
                          {MONTHLY_HIRING_VOLUME_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Work setup
                        <select
                          value={formData.workSetup}
                          onChange={(event) => updateField("workSetup", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors focus:border-[#332477]"
                        >
                          <option value="">Select work setup</option>
                          {WORK_SETUP_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        What are you looking to solve?
                        <textarea
                          value={formData.problemToSolve}
                          onChange={(event) => updateField("problemToSolve", event.target.value)}
                          rows={5}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Password
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(event) => updateField("password", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Confirm password
                        <input
                          type="password"
                          value={formData.confirmPassword}
                          onChange={(event) => updateField("confirmPassword", event.target.value)}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                        />
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium text-[#1A1B21]">
                        Workspace slug
                        <input
                          type="text"
                          value={formData.workspaceSlug}
                          onChange={(event) => {
                            setIsWorkspaceSlugManuallyEdited(true);
                            updateField("workspaceSlug", event.target.value);
                          }}
                          className="rounded-[8px] border border-[#E8E6F8] bg-white px-4 py-3 text-sm text-[#1A1B21] outline-none transition-colors placeholder:text-[#8C89A3] focus:border-[#332477]"
                          placeholder="company-name"
                        />
                        <span className="text-xs text-[#61607D]">
                          Auto-generated from company name, but you can edit it.
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {submitError ? <div className="border-t border-[#E8E6F8] px-5 py-3 text-sm text-[#B42318]">{submitError}</div> : null}

                <div className="flex items-center justify-between border-t border-[#E8E6F8] px-5 py-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={currentStep === 1 || isSubmitting || !!registrationSummary}
                    className="rounded-[8px] border border-[#332477] px-4 py-2.5 font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-[#332477] transition-colors hover:bg-[#332477]/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={isSubmitting || !!registrationSummary}
                    className="rounded-[8px] bg-[#332477] px-4 py-2.5 font-[family-name:var(--font-poppins)] text-[14px] font-semibold text-white transition-colors hover:bg-[#4A3D8F] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Creating workspace...
                      </span>
                    ) : currentStep === 4 ? "Create workspace" : "Continue"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
