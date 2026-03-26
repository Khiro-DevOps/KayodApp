export type UserRole = "job_seeker" | "employer";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employer {
  id: string;
  user_id: string;
  company_name: string;
  company_description: string | null;
  company_website: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobListing {
  id: string;
  employer_id: string;
  title: string;
  description: string;
  requirements: string | null;
  skills: string[] | null;
  location: string | null;
  salary_range: string | null;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
  // Joined fields
  employers?: Employer;
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  extracted_text: string | null;
  created_at: string;
}

export interface TailoredResume {
  id: string;
  user_id: string;
  resume_id: string | null;
  job_listing_id: string | null;
  tailored_text: string;
  keywords: string[] | null;
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  job_listing_id: string;
  resume_id: string | null;
  tailored_resume_id: string | null;
  status: "applied" | "shortlisted" | "interview" | "hired";
  match_score: number | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  job_listings?: JobListing;
  profiles?: Profile;
  resumes?: Resume;
}

export interface Interview {
  id: string;
  application_id: string;
  scheduled_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  applications?: Application;
}

export interface Employee {
  id: string;
  employer_id: string;
  application_id: string | null;
  full_name: string;
  job_title: string;
  start_date: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: "apply" | "shortlist" | "interview" | "hire";
  is_read: boolean;
  related_application_id: string | null;
  created_at: string;
}
