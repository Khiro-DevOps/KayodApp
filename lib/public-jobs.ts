export interface PublicJobBenefit {
  label: string;
  amount: number;
}

export interface PublicJobPosting {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  required_skills: string[] | null;
  employment_type: string | null;
  work_setup: string | null;
  is_remote: boolean | null;
  job_category: string | null;
  industry: string | null;
  location: string | null;
  city_id: string | null;
  province_id: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  min_experience: number | null;
  slots: number | null;
  published_at: string | null;
  closes_at: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  public_benefits: PublicJobBenefit[] | null;
}

export const PUBLIC_JOB_COLUMNS = [
  "id",
  "title",
  "description",
  "requirements",
  "responsibilities",
  "required_skills",
  "employment_type",
  "work_setup",
  "is_remote",
  "job_category",
  "industry",
  "location",
  "city_id",
  "province_id",
  "salary_min",
  "salary_max",
  "currency",
  "min_experience",
  "slots",
  "published_at",
  "closes_at",
  "company_name",
  "company_logo_url",
  "public_benefits",
].join(", ");

export function formatEmploymentType(value: string | null | undefined): string {
  if (!value) return "Full-time";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    full_time: "Full-time",
    part_time: "Part-time",
    contract: "Contract",
    temporary: "Temporary",
    internship: "Internship",
    freelance: "Freelance",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

export function formatWorkSetup(
  value: string | null | undefined,
  isRemote?: boolean | null
): string {
  if (isRemote && !value) return "Remote";
  if (!value) return "On-site";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    onsite: "On-site",
    "on-site": "On-site",
    remote: "Remote",
    hybrid: "Hybrid",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = "PHP"
): string | null {
  const hasMin = typeof min === "number" && Number.isFinite(min) && min > 0;
  const hasMax = typeof max === "number" && Number.isFinite(max) && max > 0;
  if (!hasMin && !hasMax) return null;

  const fmt = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
    maximumFractionDigits: 0,
  });

  if (hasMin && hasMax) {
    return min === max ? fmt.format(min) : `${fmt.format(min)} – ${fmt.format(max)}`;
  }
  if (hasMin) return `From ${fmt.format(min)}`;
  return `Up to ${fmt.format(max as number)}`;
}

export function formatPostedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function normalizeBenefits(raw: unknown): PublicJobBenefit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      label: typeof item.label === "string" ? item.label.trim() : "",
      amount: typeof item.amount === "number" ? item.amount : Number(item.amount) || 0,
    }))
    .filter((item) => item.label.length > 0);
}

export function formatBenefitChip(benefit: PublicJobBenefit): string {
  if (benefit.amount > 0) {
    const formatted = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(benefit.amount);
    return `${benefit.label} (${formatted})`;
  }
  return benefit.label;
}
