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
