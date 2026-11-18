type RecordLike = Record<string, unknown> | null | undefined;

export interface OfferSalarySource {
  offered_salary?: number | string | null;
  salary?: number | string | null;
  offered_compensation?: number | string | null;
  financial_package?: RecordLike;
  job_metadata?: RecordLike;
  metadata?: RecordLike;
}

export interface JobPostingSalarySource {
  salary_min?: number | string | null;
  salary_max?: number | string | null;
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function pickFromRecord(record: RecordLike, keys: string[]): number | null {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    const found = toPositiveNumber(record[key]);
    if (found !== null) return found;
  }
  return null;
}

const SALARY_KEYS = [
  "offered_salary",
  "base_salary",
  "salary_amount",
  "salary",
  "offered_compensation",
  "compensation",
  "monthly_salary",
];

export interface OfferCompensation {
  baseSalary: number;
  monthlyAllowance: number;
  attendanceIncentive: number;
}

const ALLOWANCE_KEYS = [
  "monthly_allowance",
  "allowance",
  "phMonthlyAllowance",
  "recurring_allowance",
];

const INCENTIVE_KEYS = [
  "attendance_incentive",
  "perfect_attendance_incentive",
  "phAttendanceIncentive",
];

function toNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function pickNonNegativeFromRecord(record: RecordLike, keys: string[]): number | null {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    if (record[key] === undefined || record[key] === null || record[key] === "") continue;
    const found = toNonNegativeNumber(record[key]);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Resolve full recurring compensation from a job_offers row:
 * baseSalary, monthlyAllowance, and attendanceIncentive.
 */
export function resolveOfferCompensation(
  offer: OfferSalarySource | null | undefined,
  jobPosting?: JobPostingSalarySource | null,
  fallbackSalary = 35000,
): OfferCompensation {
  const baseSalary = resolveOfferSalary(offer, jobPosting, fallbackSalary);

  if (!offer) {
    return {
      baseSalary,
      monthlyAllowance: 0,
      attendanceIncentive: 0,
    };
  }

  const monthlyAllowance =
    pickNonNegativeFromRecord(offer.financial_package, ALLOWANCE_KEYS) ??
    pickNonNegativeFromRecord(offer.job_metadata, ALLOWANCE_KEYS) ??
    pickNonNegativeFromRecord(offer.metadata, ALLOWANCE_KEYS) ??
    0;

  const attendanceIncentive =
    pickNonNegativeFromRecord(offer.financial_package, INCENTIVE_KEYS) ??
    pickNonNegativeFromRecord(offer.job_metadata, INCENTIVE_KEYS) ??
    pickNonNegativeFromRecord(offer.metadata, INCENTIVE_KEYS) ??
    0;

  return {
    baseSalary,
    monthlyAllowance,
    attendanceIncentive,
  };
}

/**
 * Resolve confirmed monthly salary from a job_offers row (top-level columns,
 * financial_package, job_metadata, and DocuSeal/offer metadata), falling back
 * to job_postings salary_min / salary_max and finally `defaultSalary`.
 */
export function resolveOfferSalary(
  offer: OfferSalarySource | null | undefined,
  jobPosting?: JobPostingSalarySource | null,
  defaultSalary = 35000,
): number {
  if (offer) {
    const direct =
      toPositiveNumber(offer.offered_salary) ??
      toPositiveNumber(offer.salary) ??
      toPositiveNumber(offer.offered_compensation);
    if (direct !== null) return direct;

    const fromPackage = pickFromRecord(offer.financial_package, SALARY_KEYS);
    if (fromPackage !== null) return fromPackage;

    const fromJobMeta = pickFromRecord(offer.job_metadata, SALARY_KEYS);
    if (fromJobMeta !== null) return fromJobMeta;

    const fromMeta = pickFromRecord(offer.metadata, SALARY_KEYS);
    if (fromMeta !== null) return fromMeta;
  }

  if (jobPosting) {
    const postingSalary =
      toPositiveNumber(jobPosting.salary_min) ??
      toPositiveNumber(jobPosting.salary_max);
    if (postingSalary !== null) return postingSalary;
  }

  return defaultSalary;
}
