# 📱 Kayod UI/UX Design System (Mobile-First)

## 🧾 Overview

Kayod is a mobile-first SaaS platform designed to streamline hiring and onboarding. The UI prioritizes clarity, speed, and usability for both job seekers and employers. The design emphasizes minimalism, accessibility, and efficient workflows.

---

# 🎯 Design Principles

## 1. Simplicity First
- Avoid clutter
- One primary action per screen
- Clear hierarchy

## 2. Mobile-First UX
- Designed for small screens first (320px–480px)
- Scales up to tablet and desktop

## 3. Fast Interactions
- Minimize clicks/taps
- Use bottom navigation for key actions

## 4. Clarity Over Decoration
- Clean typography
- Subtle colors
- Clear status indicators

---

# 🎨 Visual Design System

## 🖌️ Color Palette

### Primary
- **Primary Blue**: `#2563EB`
- **Primary Dark**: `#1E40AF`

### Neutral
- **Background**: `#F9FAFB`
- **Surface**: `#FFFFFF`
- **Border**: `#E5E7EB`

### Text
- **Primary Text**: `#111827`
- **Secondary Text**: `#6B7280`

### Status Colors
- **Success (Hired)**: `#16A34A`
- **Warning (Interview)**: `#F59E0B`
- **Info (Applied)**: `#3B82F6`
- **Danger**: `#EF4444`

---

## 🔤 Typography (2–3 Fonts Only)

### Primary Font (UI)
- **Inter**
- Used for:
  - Body text
  - Buttons
  - Forms

### Secondary Font (Headings)
- **Poppins**
- Used for:
  - Page titles
  - Section headers

### Optional Monospace (Technical Display)
- **JetBrains Mono**
- Used for:
  - Match scores
  - AI outputs (optional)

---

## 📏 Spacing System

Use 8px scale:
- 4px (xs)
- 8px (sm)
- 16px (md)
- 24px (lg)
- 32px (xl)

---

## 🔲 Components Style

### Buttons
- Rounded: `rounded-2xl`
- Padding: `px-4 py-2`
- Primary: Blue background, white text
- Secondary: Border + text

### Cards
- White background
- Soft shadow
- Rounded corners (`rounded-2xl`)
- Padding: `p-4`

### Inputs
- Rounded (`rounded-xl`)
- Border: light gray
- Focus: blue outline

---

# 📱 Layout Structure (Mobile-First)

## 🔻 Bottom Navigation (Core UX)

- Fixed at bottom
- Icons + labels
- Highlight active tab

---

## 📐 Page Container

- Max width: `480px`
- Centered on desktop
- Padding: `16px`

---

# 📲 Screens & UI Flow

---

## 🏠 1. Home Dashboard

### Job Seeker:
- Greeting header
- “Recommended Jobs” list
- Recent applications

### Employer:
- Summary cards:
  - Total Jobs
  - Applicants
  - Hires

---

## 💼 2. Job Listings Page

### Layout:
- Search bar (top)
- Filter (optional)
- Job cards list

### Job Card:
- Title
- Company
- Match score (if available)
- Apply button

---

## 📄 3. Job Details Page

### Sections:
- Job title + company
- Description
- Requirements

### Actions:
- **Tailor Resume (Primary CTA)**
- Apply

---

## 🧠 4. AI Resume Tailoring Screen

### Layout:
- Split view (stacked on mobile)

#### Top:
- Job description (collapsed)

#### Bottom:
- AI-generated resume

### Actions:
- Edit
- Save
- Apply

---

## 📤 5. Applications Page

### List View:
Each item shows:
- Job title
- Status badge:
  - Applied
  - Shortlisted
  - Interview
  - Hired

---

## 📅 6. Interview Screen

- Date & time
- Notes
- Status indicator

---

## 🔔 7. Notifications Page

### List:
- Message
- Timestamp
- Read/unread indicator

---

## 📊 8. Employer Dashboard (Analytics)

### Cards:
- Total Jobs
- Applicants
- Hires

### Simple Chart (optional):
- Applicants per job

---

## 🧑‍💼 9. Employee Records Page

- List of hired employees
- Name
- Position
- Status

---

# 🧩 UX Patterns

## ✅ Status Badges
- Rounded pill
- Color-coded

## 🔄 Loading States
- Skeleton loaders
- Spinner for AI actions

## ⚠️ Empty States
- Friendly message
- CTA button

---

# ⚡ Microinteractions

- Button tap animations
- Smooth page transitions
- Toast notifications for actions

---

# 📦 PWA Considerations

- Responsive layout
- Installable app
- Offline fallback (basic)
- Fast load time

---

# 🔐 Accessibility

- High contrast text
- Tap targets ≥ 44px
- Clear labels for buttons

---

# 🧠 Design Summary

Kayod’s UI is:
- Clean and minimal
- Mobile-first
- Action-driven
- Focused on hiring workflow

It balances:
- Simplicity (for usability)
- Functionality (for employers)
- Intelligence (AI features)

---