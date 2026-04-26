// ============================================================
// KAYOD HRIS — TypeScript Types
// Matches the full Supabase schema
// ============================================================

export type UserRole = "candidate" | "employee" | "hr_manager" | "admin";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "shortlisted"
  | "interview_scheduled"
  | "interviewed"
  | "offer_sent"
  | "hired"
  | "rejected"
  | "withdrawn";

export type InterviewType = "online" | "in_person";

export type InterviewStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show";

export type LeaveType =
  | "vacation"
  | "sick"
  | "emergency"
  | "maternity"
  | "paternity"
  | "unpaid"
  | "other";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type PayrollStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "paid"
  | "cancelled";

export type ScheduleShift =
  | "morning"
  | "afternoon"
  | "evening"
  | "night"
  | "custom";

export type NotificationType =
  | "application_submitted"
  | "application_status_changed"
  | "interview_scheduled"
  | "interview_reminder"
  | "interview_cancelled"
  | "offer_letter"
  | "leave_status_changed"
  | "payroll_processed"
  | "schedule_published"
  | "general";

export type WorkSetup = "onsite" | "remote" | "hybrid";

export type EmploymentType =
  | "full-time"
  | "part-time"
  | "contract"
  | "internship";

export type EmploymentStatus =
  | "active"
  | "on_leave"
  | "suspended"
  | "terminated";

export type PayFrequency =
  | "weekly"
  | "bi_weekly"
  | "semi_monthly"
  | "monthly";

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  age: number | null;
  address: string | null;
  city: string | null;
  country: string;
  created_at: string;
  updated_at: string;
  full_name?: string;
}

export interface Resume {
  id: string;
  candidate_id: string;
  input_data: Record<string, unknown>;
  generated_content: Record<string, unknown>;
  content_text: string | null;
  pdf_url: string | null;
  title: string;
  is_primary: boolean;
  gemini_model: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  manager_id: string | null;
  created_at: string;
  manager?: Profile;
}

export interface JobPosting {
  id: string;
  department_id: string | null;
  created_by: string;
  tenant_id: string;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  work_setup: WorkSetup;
  is_remote: boolean;
  industry: string | null;
  job_category: string | null;
  employment_type: EmploymentType;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  slots: number;
  is_published: boolean;
  published_at: string | null;
  closes_at: string | null;
  required_skills: string[];
  created_at: string;
  updated_at: string;
  departments?: Department;
  creator?: Profile;
}

export interface JobListing {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  requirements: string | null;
  skills: string[] | null;
  location: string | null;
  work_setup: WorkSetup;
  employment_type: EmploymentType;
  salary_range: string | null;
  status: string;
  employers?: { company_name: string } | null;
}

export interface TailoredResume {
  id: string;
  tailored_text: string;
  keywords: string[];
  created_at: string;
}

export interface Application {
  id: string;
  job_posting_id: string;
  candidate_id: string;
  resume_id: string;
  status: ApplicationStatus;
  cover_letter: string | null;
  match_score: number | null;
  hr_notes: string | null;
  interview_preference?: InterviewType | null;
  interview_preference_set_at?: string | null;
  interview_qualified_at?: string | null;
  hr_offered_modes?: InterviewType[] | null;
  hr_office_address?: string | null;
  selected_mode?: InterviewType | null;
  selected_mode_set_at?: string | null;
  submitted_at: string;
  updated_at: string;
  job_postings?: JobPosting;
  profiles?: Profile;
  resumes?: Resume;
}

export interface Interview {
  id: string;
  application_id: string;
  scheduled_by: string;
  interview_type: InterviewType;
  available_modes?: InterviewType[] | null;
  location_details?: string | null;
  applicant_selection?: InterviewType | null;
  status: InterviewStatus;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  // In-person
  location_address: string | null;
  location_notes: string | null;
  // Online — Jitsi Meet
  video_room_url: string | null;
  video_room_name: string | null;
  video_provider: string | null;
  room_not_before: string | null;  // ← NEW: ISO timestamp, 15 min before scheduled_at
  room_expires_at: string | null;  // ← NEW: ISO timestamp, 2 hrs after scheduled_at
  // After interview
  interviewer_notes: string | null;
  interview_score: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  applications?: Application;
  panelists?: InterviewPanelist[];
}

export interface InterviewPanelist {
  id: string;
  interview_id: string;
  panelist_id: string;
  profiles?: Profile;
}

export interface Employee {
  id: string;
  profile_id: string;
  application_id: string | null;
  department_id: string | null;
  reports_to: string | null;
  employee_number: string;
  job_title: string;
  employment_type: EmploymentType;
  employment_status: EmploymentStatus;
  start_date: string;
  end_date: string | null;
  base_salary: number;
  pay_frequency: PayFrequency;
  currency: string;
  sss_number: string | null;
  philhealth_number: string | null;
  pagibig_number: string | null;
  tin_number: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  departments?: Department;
  manager?: Employee;
}

export interface Schedule {
  id: string;
  employee_id: string;
  created_by: string;
  week_start: string;
  shift: ScheduleShift;
  custom_start: string | null;
  custom_end: string | null;
  shift_start: string;
  shift_end: string;
  location: string | null;
  notes: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  employees?: Employee;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  reviewed_by: string | null;
  leave_type: LeaveType;
  status: LeaveStatus;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  hr_remarks: string | null;
  filed_at: string;
  reviewed_at: string | null;
  updated_at: string;
  employees?: Employee;
  reviewer?: Profile;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  year: number;
  total_credits: number;
  used_credits: number;
  remaining: number;
  updated_at: string;
}

export interface PayrollPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: PayrollStatus;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  creator?: Profile;
  approver?: Profile;
}

export interface Payslip {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  basic_pay: number;
  overtime_pay: number;
  allowances: number;
  bonuses: number;
  gross_pay: number;
  sss_contribution: number;
  philhealth_contrib: number;
  pagibig_contrib: number;
  withholding_tax: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  status: PayrollStatus;
  remarks: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  employees?: Employee;
  payroll_periods?: PayrollPeriod;
}

export interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export type PunchType = "in" | "out";

export interface TimeLog {
  id: string;
  employee_id: string;
  punch_type: PunchType;
  punched_at: string;
  location_data: { lat: number; lng: number; accuracy: number } | null;
  total_hours: number | null;
  paired_log_id: string | null;
  created_at: string;
}

export type NewApplication = Omit<Application,
  "id" | "submitted_at" | "updated_at" | "match_score" |
  "job_postings" | "profiles" | "resumes"
>;

export type NewLeaveRequest = Omit<LeaveRequest,
  "id" | "total_days" | "filed_at" | "reviewed_at" |
  "updated_at" | "employees" | "reviewer"
>;

export type NewInterview = Omit<Interview,
  "id" | "created_at" | "updated_at" | "applications" | "panelists"
>;

export type NewPayslip = Omit<Payslip,
  "id" | "gross_pay" | "total_deductions" | "net_pay" |
  "created_at" | "updated_at" | "employees" | "payroll_periods"
>;

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft:                "bg-gray-100 text-gray-700",
  submitted:            "bg-blue-100 text-blue-700",
  under_review:         "bg-yellow-100 text-yellow-700",
  shortlisted:          "bg-purple-100 text-purple-700",
  interview_scheduled:  "bg-indigo-100 text-indigo-700",
  interviewed:          "bg-cyan-100 text-cyan-700",
  offer_sent:           "bg-orange-100 text-orange-700",
  hired:                "bg-green-100 text-green-700",
  rejected:             "bg-red-100 text-red-700",
  withdrawn:            "bg-gray-100 text-gray-500",
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const PAYROLL_STATUS_COLORS: Record<PayrollStatus, string> = {
  draft:            "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved:         "bg-blue-100 text-blue-700",
  paid:             "bg-green-100 text-green-700",
  cancelled:        "bg-red-100 text-red-700",
};