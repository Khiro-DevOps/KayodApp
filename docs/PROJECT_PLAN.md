
---

# 🧾 🔷 Kayod Project Plan (FINAL VERSION)

## 📌 Project Name

**Kayod – AI-Assisted Hiring and Onboarding SaaS Platform**

---

# 🔷 1. 🎯 Project Goal

Develop a **web-based SaaS platform** where:

* Employers can manage hiring from job posting to onboarding
* Job seekers can tailor resumes using AI and apply to jobs
* The system supports a complete hiring lifecycle:

👉 **Apply → Match → Interview → Hire → Employee Record**

---

# 🔷 2. 🧩 Final Feature Scope (MVP)

## 🔐 Authentication

* Supabase Auth
* Role-based access:

  * job_seeker
  * employer

---

## 🔵 Job Listings

* Employer CRUD for jobs
* Job seeker browsing

---

## 🟢 Resume Management

* Upload PDF resumes
* Extract text
* Store multiple resumes

---

## 🧠 AI Resume Tailoring (CORE)

* Resume + Job Description → AI output
* Save tailored resumes

---

## 🟡 Job Matching System

* Compute match score (0–100)
* Store per application

---

## 🟣 Application Tracking (ATS)

* Status:

  * applied
  * shortlisted
  * interview
  * hired

---

## 📅 Interview Scheduling

* Set date/time + notes
* Linked to application

---

## 🔔 Notification System

* In-app only
* Triggered on:

  * apply
  * shortlist
  * interview
  * hire

---

## 📊 Analytics Dashboard

* Total jobs
* Applicants per job
* Total hires

---

## 🟤 Employee Module (Basic HRIS)

* Created on hire
* Stores employee info

---

# 🔷 3. 🧱 Tech Stack

## Frontend

* Next.js (App Router)
* Tailwind CSS
* shadcn/ui (optional)

## Backend

* Supabase (PostgreSQL, Auth, Storage)

## API Layer

* Next.js API Routes

## AI

* OpenAI API (resume tailoring)

## Storage

* Supabase Storage (resumes)

## Deployment

* Vercel + Supabase

---

# 🔷 4. 🗄️ Database Tables

* users
* profiles
* employers
* job_listings
* applications
* resumes
* tailored_resumes
* interviews
* employees
* notifications

---

# 🔷 5. 🔄 System Flow

## 👤 Job Seeker

1. Register/Login
2. Upload resume
3. Browse jobs
4. Tailor resume (AI)
5. Apply
6. Receive notifications
7. View interview

---

## 🏢 Employer

1. Register/Login
2. Post job
3. View applicants
4. Review match scores
5. Shortlist
6. Schedule interview
7. Hire
8. View analytics

---

# 🔷 6. 🧠 AI Feature Spec

## Endpoint

`POST /api/tailor-resume`

## Input:

* resume_text
* job_description

## Output:

* tailored_resume
* suggested keywords

---

# 🔷 7. 🧪 Development Roadmap (6 Weeks)

---

## 🟢 Week 1: Foundation

### Tasks:

* Setup Next.js project
* Setup Supabase project
* Configure Auth (login/register)
* Create database schema

### Output:

* Working authentication
* Connected database

---

## 🟡 Week 2: Job & User Features

### Tasks:

* Job listings CRUD
* Employer dashboard
* Job browsing page

### Output:

* Employers can post jobs
* Job seekers can view jobs

---

## 🔵 Week 3: Resume + Applications

### Tasks:

* Resume upload (Supabase Storage)
* Resume text extraction
* Apply to job feature
* Applications table integration

### Output:

* Users can apply with resumes

---

## 🟣 Week 4: AI + Matching

### Tasks:

* AI API route (resume tailoring)
* Display tailored resume
* Match scoring function
* Store match score

### Output:

* AI resume tailoring works
* Match scores visible

---

## 🟤 Week 5: Hiring Pipeline

### Tasks:

* Application status updates
* Interview scheduling
* Employee record creation

### Output:

* Full hiring workflow functional

---

## 🔴 Week 6: Final Features + Polish

### Tasks:

* Notification system
* Analytics dashboard
* UI improvements
* Bug fixing

### Output:

* Complete MVP system

---

# 🔷 8. 📊 Key Functional Rules

* One application per job per user
* Match score stored per application
* Interview linked to application
* Hiring creates employee record
* Notifications triggered on key events

---

# 🔷 9. ⚠️ Constraints

* No payroll or full HRIS
* No email/SMS notifications
* No external calendar integration
* AI usage must be limited

---

# 🔷 10. 🚀 Deliverables

* Functional web app
* Database schema (ERD + SQL)
* AI resume tailoring feature
* Hiring pipeline system
* Notifications & analytics
* System architecture diagram

---

