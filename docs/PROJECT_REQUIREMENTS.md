
---

# 📄 🔷 Product Requirements Document (PRD)

## 1. 📌 Product Overview

**Product Name:** Kayod
**Product Type:** B2B SaaS (Employer-funded platform)

**Description:**
Kayod is an AI-assisted hiring platform that enables employers to streamline recruitment and onboarding while helping job seekers improve their resumes for better job matching. The system integrates job posting, applicant tracking, AI-powered resume tailoring, interview scheduling, notifications, analytics, and a lightweight employee management module into a single platform.

**Target Users:**

* Employers (paying customers)
* Job Seekers (free users)

---

## 2. 🎯 Objectives

### Primary Goals:

* Improve hiring efficiency for employers
* Increase job seeker success through AI-assisted resume optimization
* Provide a seamless hiring pipeline from application to employee creation

### Success Criteria:

* Employers can post jobs and successfully hire candidates
* Job seekers can generate tailored resumes
* End-to-end workflow (Apply → Interview → Hire → Employee) is functional
* Users receive timely system notifications

---

## 3. 👥 User Roles

### 👤 Job Seeker

* Register and manage profile
* Upload and tailor resumes using AI
* Apply to job listings
* View application status and interview schedules
* Receive notifications

---

### 🏢 Employer

* Subscribe to platform
* Post and manage job listings
* Review applicants and match scores
* Manage hiring pipeline
* Schedule interviews
* View analytics dashboard
* Manage employee records

---

## 4. 🧩 Core Features (MVP Scope)

---

### 🔐 4.1 Authentication & Authorization

* User registration and login (Supabase Auth)
* Role-based access:

  * `job_seeker`
  * `employer`

---

### 🔵 4.2 Job Listings

**Employer:**

* Create, edit, delete job listings
* Define job description, requirements, and skills

**Job Seeker:**

* Browse and view job listings

---

### 🟢 4.3 Resume Management

* Upload resume (PDF)
* Extract and store resume text
* Manage multiple resumes

---

### 🧠 4.4 AI Resume Tailoring (Core Feature)

* Input:

  * Resume text
  * Job description
* Output:

  * Improved, job-aligned resume
* Users can:

  * Review and edit
  * Save tailored resumes

---

### 🟡 4.5 Job Matching System

* Compare resume content with job description
* Generate a **match score (0–100)**
* Display score to employers

---

### 🟣 4.6 Application Tracking System (ATS)

**Application statuses:**

* Applied
* Shortlisted
* Interview Scheduled
* Hired

**Employer capabilities:**

* View applicants
* Update application status
* Review match scores

---

### 📅 4.7 Interview Scheduling

* Employers can:

  * Set interview date/time
  * Add notes
* Job seekers can:

  * View scheduled interviews

**Scope Limitation:**

* No calendar integrations (internal scheduling only)

---

### 🔔 4.8 Notification System

**Type:** In-app notifications

**Triggers:**

* Application submission
* Shortlisting
* Interview scheduling
* Hiring

**Features:**

* Notification list
* Read/unread status

---

### 📊 4.9 Analytics Dashboard

**Available to employers:**

* Total job postings
* Number of applicants per job
* Total hires

**Scope Limitation:**

* Simple counts and summaries only (no advanced analytics)

---

### 🟤 4.10 Basic Employee Module (HRIS Lite)

Triggered when applicant is marked as **Hired**.

**Features:**

* Create employee record
* Store:

  * Name
  * Job title
  * Start date
  * Status (Active)

**Scope Limitation:**

* No payroll, attendance, or performance tracking

---

## 5. 🔄 User Flows

### Job Seeker Flow:

1. Register/Login
2. Upload resume
3. Browse jobs
4. Tailor resume using AI
5. Apply to job
6. Receive notifications
7. View interview schedule

---

### Employer Flow:

1. Register/Login
2. Post job listing
3. View applicants
4. Review match scores
5. Shortlist candidates
6. Schedule interview
7. Mark candidate as hired
8. View analytics dashboard
9. Manage employee records

---

## 6. 🧱 System Architecture

### Frontend:

* Next.js (App Router)

### Backend:

* Supabase (PostgreSQL, Auth, Storage)

### API Layer:

* Next.js API Routes

### AI Integration:

* Gemini API (resume tailoring)

---

## 7. 🗄️ Data Model (Key Entities)

* Users
* Profiles (Job Seekers)
* Employers
* Job Listings
* Applications
* Resumes
* Tailored Resumes
* Interviews
* Employees
* Notifications

---

## 8. 🧪 Functional Requirements

* Users must authenticate before accessing system features
* Employers can only manage their own job listings
* Job seekers can apply to jobs using stored resumes
* Match score must be generated for each application
* Interview must be linked to an application
* Hiring must create an employee record
* Notifications must be triggered on key actions

---

## 9. ⚠️ Constraints & Limitations

* No full HRIS functionality (payroll, attendance excluded)
* AI usage is limited for cost control
* No external integrations (calendar, email, SMS)
* Resume parsing is basic (text extraction only)

---

## 10. 🚀 Future Enhancements

* Full HRIS system:

  * Payroll
  * Attendance tracking
* Advanced analytics (predictive insights)
* Email/SMS notifications
* Calendar integrations
* AI-powered candidate evaluation

---

## 11. 🧪 Non-Functional Requirements

* Responsive and user-friendly UI
* Secure authentication and data handling
* Fast API response times
* Scalable architecture (via Supabase)
* Data privacy for user resumes

---

