# Philippine-Compliant Offer Letter - UI/UX Specification

## Visual Design System

### Color Palette (Dark Theme)
```
Background Primary:    #1a1a1a
Background Secondary:  #121212  (deeper areas)
Background Tertiary:   #0f0f0f  (input fields)
Border Color:          #333     (section dividers)
Text Primary:          text-text-primary
Text Secondary:        text-text-secondary
Primary Action:        primary  (button color)
Success/Mandatory:     green-400, green-500/10 (background)
Warning:               orange-400, orange-500/10
Error:                 red-400, red-500/10
Info:                  blue-400, blue-500/10
```

### Typography
```
Header (h2):           lg font-semibold text-text-primary
Section Label:         text-sm font-medium text-text-primary
Field Label:           text-sm font-medium text-text-primary
Help Text:             text-xs text-text-secondary
Badge:                 text-xs font-semibold px-2 py-1 rounded-md
```

### Spacing & Layout
```
Section Gap:           space-y-4
Form Field Gap:        space-y-2
Container Padding:     px-4 py-3 (header), px-4 py-4 (content)
Border Radius:         rounded-lg, rounded-md
```

---

## Section-by-Section UI Layout

### HEADER (Always Visible)
```
┌─────────────────────────────────────────────────────────┐
│  📋 Offer Letter Settings                              │
│  Configure all employment terms and conditions. Fields │
│  marked as [Required] must be completed.              │
└─────────────────────────────────────────────────────────┘
```

### SECTION 1: Job Details [Required]
```
┌─ 📁 Job Details ───────────────────────────────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │                                                  │   │
│ │ Official Job Title *          | Department *    │   │
│ │ [Text Input]                  | [Text Input]    │   │
│ │ e.g. Senior Software Engineer | e.g. Engineering
│ │                                                  │   │
│ │ Supervisor Name *             | Supervisor Title
│ │ [Text Input]                  | [Text Input]    │   │
│ │ Full name of direct supervisor| e.g. Eng. Mgr  │   │
│ │                                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ Job Responsibilities / Description *                   │
│ ┌──────────────────────────────────────────────────┐  │
│ │ [Textarea - 4 rows]                              │  │
│ │ Brief summary of key duties and responsibilities │  │
│ │ for this role...                                 │  │
│ │                                                  │  │
│ │ (Minimum 10 chars. This will appear in offer)   │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 2: Employment Terms (PH Compliance) [Required]
```
┌─ 📋 Employment Terms (PH Compliance) ───────────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │ Employment Status *            | Probation Period
│ │ [Dropdown] Regular ▼           | [Number Input] 6 │  │
│ │                                | Default: 6 months │  │
│ │                                                  │   │
│ │ Start Date *                   | Work Location * │  │
│ │ [Date Picker]                  | [Text Input]    │  │
│ │                                | e.g. BGC Taguig │  │
│ │                                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ ⚠️  ART. 281 COMPLIANCE WARNING (if > 180 days)       │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 🔔 Probation period exceeds 180 days. Per the   │  │
│ │    Philippine Labor Code, probation should not  │  │
│ │    exceed 6 months for rank-and-file employees. │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ Work Schedule *                                        │
│ [Text Input]                                          │
│ e.g., Mon-Fri, 8:00 AM - 5:00 PM                     │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 3: Compensation (PHP) [Required]
```
┌─ 💰 Compensation (PHP) ────────────────────────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │ Monthly Basic Salary (PHP) *   | Pay Frequency * │  │
│ │ [₱ Input] 150000               | [Dropdown] Monthly
│ │                                │                   │  │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ ┌─ 13TH MONTH PAY (Mandatory) ──────────────────────┐  │
│ │ ☑ 13th Month Pay                                 │  │
│ │   Required by P.D. 851 (Presidential Decree      │  │
│ │   No. 851). This entitlement is mandatory.       │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ADDITIONAL COMPENSATION (Optional)                     │
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │ Performance Bonus (PHP)        | Signing Bonus  │   │
│ │ [₱ Input]                      | [₱ Input]      │   │
│ │                                                  │   │
│ │ Commission Structure                             │   │
│ │ [Text Input] e.g. 5% of sales; tiered...       │   │
│ │                                                  │   │
│ │ Transport Allow. (PHP)         | Meal Allow. (PHP)
│ │ [₱ Input]                      | [₱ Input/Day]  │   │
│ │                                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ Night Differential (%)                                 │
│ [Input] 10 %                                          │
│ ℹ️  Per RA 11165, minimum night differential is 10%   │
│    (₱15,000.00)                                        │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 4: Benefits Package [Required]
```
┌─ 🎁 Benefits Package ──────────────────────────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ MANDATORY SOCIAL SECURITY BENEFITS (RA 7875, RA 11165)│
│                                                        │
│ ┌─ MANDATORY BENEFIT (Green border) ──────────────┐  │
│ │ ✔ ☑ SSS (Social Security System)               │  │
│ │   Mandatory employee-employer contribution for  │  │
│ │   retirement and disability benefits.           │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ┌─ MANDATORY BENEFIT (Green border) ──────────────┐  │
│ │ ✔ ☑ PhilHealth                                  │  │
│ │   Mandatory health insurance coverage for       │  │
│ │   employee and dependents.                      │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ [Similar for Pag-IBIG, SIL, Maternity/Paternity]     │
│                                                        │
│ LEAVE ENTITLEMENTS                                     │
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │ Service Incentive Leave (Days/Year) *           │   │
│ │ [Number Input] 5                                │   │
│ │ Minimum 5 days per year (RA 7875)              │   │
│ │                                                  │   │
│ │ Vacation Leave (Days/Year) | Sick Leave (D/Y)  │   │
│ │ [Input] 0                  | [Input] 0         │   │
│ │                                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ COMPANY BENEFITS (Optional)                            │
│                                                        │
│ HMO Provider                                           │
│ [Text Input] e.g. Maxicare, Intellicare, Medicard    │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ ☑ Group Life Insurance                           │  │
│ │   Company-sponsored life insurance coverage     │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ Other Perks & Benefits                                 │
│ ┌──────────────────────────────────────────────────┐  │
│ │ [Textarea] e.g. Free WiFi, Gym membership...   │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 5: Conditions & Contingencies [Optional]
```
┌─ ✅ Conditions & Contingencies ────────────────────────┐
│ ▼ [Optional Badge - Blue]                              │
├─────────────────────────────────────────────────────────┤
│ Select the pre-employment conditions and contingencies │
│ that are required for this position.                   │
│                                                        │
│ BACKGROUND VERIFICATION                                │
│ ┌──────────────────────────────────────────────────┐  │
│ │ ☐ NBI Clearance                                  │  │
│ │   National Bureau of Investigation clearance    │  │
│ │   certificate required                          │  │
│ └──────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────┐  │
│ │ ☐ Police Clearance                               │  │
│ │   Police clearance certificate from local...    │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ MEDICAL & COMPLIANCE                                   │
│ ┌──────────────────────────────────────────────────┐  │
│ │ ☑ Pre-employment Medical Exam                    │  │
│ │   Mandatory medical examination (common for...) │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ [Similar for Drug Test, TOR/Diploma, NDA, Non-compete]
│                                                        │
│ Additional Conditions or Contingencies                 │
│ [Textarea] Any other pre-employment requirements...   │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 6: Termination Language (Strict PH Law) [Required]
```
┌─ 🏛️  Termination Language (Strict PH Law) ──────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ ℹ️  COMPLIANCE NOTE (Blue Alert)                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ All termination clauses must comply with the    │  │
│ │ Philippine Labor Code. "At-Will" employment is  │  │
│ │ not recognized under PH law. Termination is     │  │
│ │ only valid for just or authorized cause.        │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ◉ Use Standard Philippine Labor Code Language          │
│    (Selected)                                          │
│                                                        │
│   ✓ Recommended: Ensures compliance with PH Labor     │
│     Law and includes all mandatory protections        │
│                                                        │
│ PREVIEW                                                 │
│ ┌──────────────────────────────────────────────────┐  │
│ │ "Termination of employment shall be in          │  │
│ │  accordance with the provisions of the          │  │
│ │  Philippine Labor Code... [full text shown]     │  │
│ │                                                  │  │
│ │  (Green border indicating approved language)    │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ ○ Use Custom Termination Clause                        │
│                                                        │
│   Only if you have legal counsel review the custom    │
│   clause for PH Law compliance                        │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### SECTION 7: Acceptance & Signing [Required]
```
┌─ ✍️  Acceptance & Signing ─────────────────────────────┐
│ ▼ [Required Badge - Red]                               │
├─────────────────────────────────────────────────────────┤
│ ┌─ TWO COLUMN LAYOUT ─────────────────────────────┐   │
│ │ Acceptance Deadline (Days) * | HR Signatory Title
│ │ [Number Input] 14             | [Text Input]   │   │
│ │ Number of days from issuance  | e.g. HR Mgr   │   │
│ │ (recommended: 7-30 days)      |                │   │
│ │                                                  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                        │
│ HR Signatory Name *                                    │
│ [Text Input] Full name of HR representative           │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ ☐ Require HR Director/CEO Countersignature     │  │
│ │   Offer letter will require approval from a     │  │
│ │   higher authority                              │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ OFFER LETTER PARAGRAPHS                                │
│                                                        │
│ Introduction Paragraph *                               │
│ ┌──────────────────────────────────────────────────┐  │
│ │ [Textarea - 5 rows, Monospace]                  │  │
│ │ Dear [Candidate Name],                          │  │
│ │                                                  │  │
│ │ We are pleased to extend this formal offer...   │  │
│ │                                                  │  │
│ │ (You can use [Candidate Name] and [Company...] │  │
│ │  as placeholders)                               │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ Closing Paragraph *                                    │
│ ┌──────────────────────────────────────────────────┐  │
│ │ [Textarea - 5 rows, Monospace]                  │  │
│ │ We look forward to welcoming you to the...      │  │
│ │                                                  │  │
│ │ [HR Signatory Name]                             │  │
│ │ [HR Signatory Title]                            │  │
│ │ [Company Name]                                  │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
└─────────────────────────────────────────────────────────┘
```

### FOOTER (Always Visible)
```
┌─────────────────────────────────────────────────────────┐
│ 📌 COMPLIANCE NOTE (Small border box)                  │
│ All employment terms must comply with the Philippine  │
│ Labor Code. This template includes validation for:    │
│ • Art. 281 (probation limits)                         │
│ • P.D. 851 (13th month pay)                           │
│ • RA 11165 (night differential minimums)              │
└─────────────────────────────────────────────────────────┘
```

---

## Interactive States

### Collapsed Section
```
[▶] Job Details            [Required Badge]
    (Closed, arrow pointing right)
```

### Expanded Section
```
[▼] Job Details            [Required Badge]
    (Open, arrow pointing down)
    
    [Form fields visible]
```

### Hover States
- Section header: `hover:bg-[#222]` (slightly lighter background)
- Buttons: `hover:bg-primary/90` (slightly darker primary)
- Inputs: `focus:border-primary focus:ring-2 focus:ring-primary/20`

### Error States
```
⚠️  Red Border + Red Text
Error message displayed below field
```

### Warning States
```
🔔 Orange/Yellow Alert Box
Warning text in smaller font
```

### Success States
```
✔️  Green checkmark on mandatory items
Green border on achievement
```

---

## Responsive Breakpoints

### Desktop (md+)
- Two-column layouts for form fields
- Accordion full width
- Side-by-side comparisons

### Tablet (sm)
- Mixed single/two-column
- Accordion responsive

### Mobile (xs)
- Single column for all fields
- Stack sections vertically
- Full-width inputs
- Horizontal scrolling for long content prevented

---

## Accessibility Features

- Proper `<label>` elements with `htmlFor` attributes
- Required field indicators with `*`
- ARIA alerts for validation errors
- Keyboard navigation (Tab through all fields)
- Sufficient color contrast (dark text on light, light text on dark)
- Focus indicators on all interactive elements
- Semantic HTML structure

---

## Animation & Transitions

### Smooth Expand/Collapse
```css
transition: transform 0.2s ease-in-out;
rotate: transform rotate-180 when open;
```

### Focus Ring
```css
transition-colors: 0.15s ease;
focus:ring-2 focus:ring-offset-0;
```

### Hover Effects
```css
transition: 0.2s ease;
hover:bg-[#222];
```

---

## Print Styling (When Offer is Printed)

- Clean black text on white
- Remove interactive elements
- Hide buttons and controls
- Maintain compliance language formatting
- Page breaks at section boundaries (optional)
