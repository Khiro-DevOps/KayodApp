"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BENEFITS_OPTIONS = [
  "HMO / Health Insurance",
  "SSS",
  "PhilHealth",
  "Pag-IBIG",
  "13th Month Pay",
  "14th Month Pay",
  "Transportation Allowance",
  "Meal Allowance",
  "Communication Allowance",
  "Performance Bonus",
  "Paid Vacation Leave",
  "Sick Leave",
  "Birthday Leave",
  "Remote Work Setup",
  "Training & Development",
];

interface OfferFormProps {
  jobId: string;
  appId: string;
  existingOffer: any;
  defaults: {
    position_title: string;
    department: string | null;
    employment_type: string;
    salary_amount: number | null;
    salary_currency: string;
    work_location: string | null;
    work_setup: string;
  };
}

export default function OfferForm({
  jobId,
  appId,
  existingOffer,
  defaults,
}: OfferFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Position
  const [positionTitle, setPositionTitle] = useState(
    existingOffer?.position_title ?? defaults.position_title
  );
  const [department, setDepartment] = useState(
    existingOffer?.department ?? defaults.department ?? ""
  );
  const [employmentType, setEmploymentType] = useState(
    existingOffer?.employment_type ?? defaults.employment_type ?? "full_time"
  );

  // Compensation
  const [salaryAmount, setSalaryAmount] = useState<number | "">(
    existingOffer?.salary_amount ?? defaults.salary_amount ?? ""
  );
  const [salaryCurrency, setSalaryCurrency] = useState(
    existingOffer?.salary_currency ?? defaults.salary_currency ?? "PHP"
  );
  const [payFrequency, setPayFrequency] = useState(
    existingOffer?.pay_frequency ?? "monthly"
  );

  // Benefits
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>(
    existingOffer?.benefits ?? []
  );

  // Work setup
  const [workSetup, setWorkSetup] = useState(
    existingOffer?.work_setup ?? defaults.work_setup ?? "on_site"
  );
  const [workLocation, setWorkLocation] = useState(
    existingOffer?.work_location ?? defaults.work_location ?? ""
  );
  const [workSchedule, setWorkSchedule] = useState(
    existingOffer?.work_schedule ?? "Mon–Fri, 8:00 AM – 5:00 PM"
  );

  // Terms & dates
  const [employmentTerms, setEmploymentTerms] = useState(
    existingOffer?.employment_terms ?? ""
  );
  const [startDate, setStartDate] = useState(
    existingOffer?.start_date ?? ""
  );
  const [offerExpiry, setOfferExpiry] = useState(
    existingOffer?.offer_expires_at
      ? new Date(existingOffer.offer_expires_at).toISOString().slice(0, 10)
      : ""
  );
  const [hrNotes, setHrNotes] = useState(
    existingOffer?.hr_notes ?? ""
  );

  const toggleBenefit = (benefit: string) => {
    setSelectedBenefits((prev) =>
      prev.includes(benefit)
        ? prev.filter((b) => b !== benefit)
        : [...prev, benefit]
    );
  };

  async function buildPayload(status: "draft" | "sent") {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return {
      application_id: appId,
      created_by: user?.id,
      position_title: positionTitle,
      department: department || null,
      employment_type: employmentType,
      salary_amount: salaryAmount === "" ? null : Number(salaryAmount),
      salary_currency: salaryCurrency,
      pay_frequency: payFrequency,
      benefits: selectedBenefits,
      work_setup: workSetup,
      work_location: workLocation || null,
      work_schedule: workSchedule || null,
      employment_terms: employmentTerms || null,
      start_date: startDate || null,
      offer_expires_at: offerExpiry
        ? new Date(offerExpiry).toISOString()
        : null,
      hr_notes: hrNotes || null,
      status,
    };
  }

  async function handleSaveDraft() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = await buildPayload("draft");

    let err;
    if (existingOffer) {
      ({ error: err } = await supabase
        .from("job_offers")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existingOffer.id));
    } else {
      ({ error: err } = await supabase.from("job_offers").insert(payload));
    }

    if (err) {
      setError(err.message);
    } else {
      router.refresh();
    }
    setSaving(false);
  }

  async function handleSendOffer() {
    if (!salaryAmount || !startDate || !offerExpiry) {
      setError("Please fill in salary, start date, and offer expiry before sending.");
      return;
    }
    setSending(true);
    setError(null);
    const supabase = createClient();
    const payload = await buildPayload("sent");

    let offerId = existingOffer?.id;
    let err;

    if (existingOffer) {
      ({ error: err } = await supabase
        .from("job_offers")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existingOffer.id));
    } else {
      const { data, error: insertErr } = await supabase
        .from("job_offers")
        .insert(payload)
        .select("id")
        .single();
      err = insertErr;
      offerId = data?.id;
    }

    if (err) {
      setError(err.message);
      setSending(false);
      return;
    }

    // Update application status to offer_sent
    await supabase
      .from("applications")
      .update({ status: "offer_sent" })
      .eq("id", appId);

    // Send notification to candidate
    const { data: appData } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", appId)
      .single();

    if (appData?.candidate_id) {
      await supabase.from("notifications").insert({
        recipient_id: appData.candidate_id,
        type: "offer_sent",
        title: "🎉 You've received a Job Offer!",
        body: `You have received a job offer for ${positionTitle}. Please review and respond before ${new Date(offerExpiry).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}.`,
        action_url: `/applications/${appId}`,
        is_read: false,
      });
    }

    setSending(false);
    router.push(`/jobs/manage/${jobId}/applicants`);
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-gray-50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30";
  const labelClass = "text-xs font-medium text-text-secondary";
  const sectionClass = "rounded-2xl border border-border bg-surface p-4 space-y-4";

  return (
    <div className="space-y-4">

      {/* Position & Employment */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Position & Employment</h2>

        <div className="space-y-1">
          <label className={labelClass}>Position Title</label>
          <input
            value={positionTitle}
            onChange={(e) => setPositionTitle(e.target.value)}
            className={inputClass}
            placeholder="e.g. Data Analyst"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Department</label>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={inputClass}
            placeholder="e.g. Technology"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Employment Type</label>
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            className={inputClass}
          >
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contractual">Contractual</option>
            <option value="probationary">Probationary</option>
          </select>
        </div>
      </div>

      {/* Compensation */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Compensation</h2>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 space-y-1">
            <label className={labelClass}>Basic Salary</label>
            <input
              type="number"
              value={salaryAmount}
              onChange={(e) =>
                setSalaryAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className={inputClass}
              placeholder="e.g. 35000"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Currency</label>
            <select
              value={salaryCurrency}
              onChange={(e) => setSalaryCurrency(e.target.value)}
              className={inputClass}
            >
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
              <option value="SGD">SGD</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Pay Frequency</label>
          <select
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value)}
            className={inputClass}
          >
            <option value="monthly">Monthly</option>
            <option value="semi_monthly">Semi-monthly (1st & 15th)</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </div>

      {/* Benefits */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Benefits</h2>
        <div className="grid grid-cols-2 gap-2">
          {BENEFITS_OPTIONS.map((benefit) => (
            <label
              key={benefit}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-xs transition-colors ${
                selectedBenefits.includes(benefit)
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border bg-gray-50 text-text-secondary hover:border-primary/40"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedBenefits.includes(benefit)}
                onChange={() => toggleBenefit(benefit)}
                className="rounded border-border accent-primary"
              />
              {benefit}
            </label>
          ))}
        </div>
      </div>

      {/* Work Setup */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Work Setup</h2>

        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "on_site", label: "🏢 On-site" },
            { value: "hybrid",  label: "🔀 Hybrid"  },
            { value: "remote",  label: "🏠 Remote"  },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setWorkSetup(opt.value)}
              className={`rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                workSetup === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-gray-50 text-text-secondary hover:border-primary/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Work Location</label>
          <input
            value={workLocation}
            onChange={(e) => setWorkLocation(e.target.value)}
            className={inputClass}
            placeholder="e.g. Cebu City, Philippines"
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Work Schedule</label>
          <input
            value={workSchedule}
            onChange={(e) => setWorkSchedule(e.target.value)}
            className={inputClass}
            placeholder="e.g. Mon–Fri, 8:00 AM – 5:00 PM"
          />
        </div>
      </div>

      {/* Employment Terms */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Employment Terms</h2>
        <p className="text-xs text-text-secondary">
          Full employment terms, probationary period, confidentiality clauses, etc.
        </p>
        <textarea
          rows={8}
          value={employmentTerms}
          onChange={(e) => setEmploymentTerms(e.target.value)}
          placeholder={`e.g.\n- 6-month probationary period\n- Confidentiality agreement applies\n- 30-day notice period upon resignation\n- Subject to company policies and code of conduct`}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Dates */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Dates</h2>

        <div className="space-y-1">
          <label className={labelClass}>Target Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1">
          <label className={labelClass}>Offer Expiry Date</label>
          <input
            type="date"
            value={offerExpiry}
            onChange={(e) => setOfferExpiry(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-text-secondary">
            The applicant must respond before this date.
          </p>
        </div>
      </div>

      {/* HR Notes */}
      <div className={sectionClass}>
        <h2 className="text-sm font-semibold text-text-primary">Internal HR Notes</h2>
        <p className="text-xs text-text-secondary">
          Not visible to the applicant.
        </p>
        <textarea
          rows={3}
          value={hrNotes}
          onChange={(e) => setHrNotes(e.target.value)}
          placeholder="Any internal notes about this offer..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pb-6">
        <button
          onClick={handleSaveDraft}
          disabled={saving || sending}
          className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-text-secondary hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          onClick={handleSendOffer}
          disabled={saving || sending}
          className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Offer"}
        </button>
      </div>
    </div>
  );
}