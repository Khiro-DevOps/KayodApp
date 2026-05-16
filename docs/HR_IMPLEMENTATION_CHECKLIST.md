# HR Implementation Checklist - Philippine-Compliant Offer Letter

## Pre-Implementation

### 1. Legal Review & Approval
- [ ] Have your legal team review the standard Labor Code language
- [ ] Verify compliance with your company's policies
- [ ] Obtain approval from HR Director/CEO
- [ ] Review non-compete clause reasonableness (max 2 years post-employment)
- [ ] Confirm all mandatory benefit eligibility

### 2. System Setup
- [ ] Database updated with `offer_letter_settings` JSONB column
- [ ] DocuSeal integration tested and connected
- [ ] User roles updated (only HR managers can create offers)
- [ ] Email notifications configured for offer sending/acceptance

### 3. Team Training
- [ ] HR team trained on Philippine Labor Law requirements
- [ ] Create templates for common positions
- [ ] Define company standard probation period
- [ ] Document approval workflows

---

## During Offer Creation

### Job Details Section
- [ ] Official job title matches internal classification
- [ ] Department correctly assigned
- [ ] Supervisor information is current
- [ ] Job responsibilities clearly documented
- [ ] No discriminatory or vague language used

### Employment Terms Section (PH Compliance Critical)
- [ ] Employment status selected (Regular/Probationary/Project-based/etc.)
- [ ] **CRITICAL**: Probation period ≤ 180 days (Art. 281) ✓ System validates
- [ ] Start date is valid and future date
- [ ] Work schedule clearly defined (hours, shifts, if applicable)
- [ ] Work location specified (office, remote, hybrid)
- [ ] For probationary: Ensure clear performance criteria will be communicated separately

### Compensation Section (PHP Currency)
- [ ] Monthly basic salary entered correctly
- [ ] Pay frequency selected (monthly/semi-monthly/weekly)
- [ ] **CRITICAL**: 13th month pay is ENABLED (P.D. 851) ✓ Cannot disable
- [ ] Performance/signing bonuses realistic
- [ ] Commission structure (if applicable) clearly defined
- [ ] Transport & meal allowances reflect company policy
- [ ] **CRITICAL**: Night differential ≥ 10% (RA 11165) ✓ System validates
- [ ] Salary complies with minimum wage (PHP 13,325/month for Metro Manila, 2024)

### Benefits Package Section (Mandatory Benefits)
- [ ] **CRITICAL**: SSS enrollment enabled (RA 7875) ✓ Cannot disable
- [ ] **CRITICAL**: PhilHealth enrollment enabled (RA 7875) ✓ Cannot disable
- [ ] **CRITICAL**: Pag-IBIG enrollment enabled (RA 7875) ✓ Cannot disable
- [ ] Service Incentive Leave (SIL) ≥ 5 days (RA 7875)
- [ ] Maternity/Paternity Leave enabled (RA 11165)
- [ ] HMO provider selected or left blank if not offered
- [ ] Life insurance details if included
- [ ] Vacation leave days specified
- [ ] Sick leave days specified
- [ ] Other perks (WFH setup, training budget, etc.) documented

### Conditions & Contingencies Section
- [ ] Pre-employment requirements checked:
  - [ ] NBI Clearance (if required)
  - [ ] Police Clearance (if required)
  - [ ] Pre-employment Medical (recommended: always check)
  - [ ] Drug Test (if required, ensure DOLE-compliant)
  - [ ] TOR/Diploma Verification (if required)
- [ ] Legal agreements:
  - [ ] NDA (if required for role)
  - [ ] Non-compete Clause (if required, verify ≤ 2 years)
- [ ] Additional conditions clearly stated

### Termination Language Section (Strict PH Law)
- [ ] **CRITICAL**: Using "Standard Philippine Labor Code Language" ✓ Recommended
  - Includes Art. 282 (just cause) references
  - Includes Art. 283 (authorized cause) references
  - Explicitly states termination requires legal cause
- [ ] OR if using custom clause:
  - [ ] Legal team has reviewed custom clause
  - [ ] Does NOT contain "at-will" employment language
  - [ ] References Labor Code Article 282 and 283
  - [ ] Clear on employee protections

### Acceptance & Signing Section
- [ ] Acceptance deadline set (recommend: 14 days from issue)
- [ ] HR signatory name entered (must be authorized to sign)
- [ ] HR signatory title is accurate
- [ ] Countersignature requirement defined (if CEO/Director approval needed)
- [ ] Introduction paragraph customized (has company tone)
- [ ] Closing paragraph customized
- [ ] Placeholders used:
  - [ ] [Candidate Name]
  - [ ] [Position Title]
  - [ ] [Company Name]
  - [ ] [HR Signatory Name]
  - [ ] [HR Signatory Title]

---

## Post-Creation Review

### Document Review Checklist
- [ ] All required fields completed (no empty required fields)
- [ ] Salary calculation: Basic + allowances ≥ minimum wage
- [ ] 13th month projection: (Annual Salary) ÷ 12 realistic
- [ ] Benefits costs factored into budget
- [ ] No contradictions between sections (e.g., salary type vs. compensation)
- [ ] Formatting is professional and clear

### Compliance Final Check
- [ ] **Art. 281**: Probation ≤ 180 days ✓
- [ ] **P.D. 851**: 13th month enabled ✓
- [ ] **RA 7875**: SSS, PhilHealth, Pag-IBIG all enabled ✓
- [ ] **RA 11165**: Night differential ≥ 10% (if applicable) ✓
- [ ] **Labor Code**: Termination language compliant ✓
- [ ] **Minimum Wage**: Salary meets regional minimum ✓

### Approval Workflow
- [ ] Department Manager approves
- [ ] HR Director reviews
- [ ] CEO/CFO approves (if salary > X threshold)
- [ ] Final sign-off before sending to candidate

---

## Before Sending to Candidate

### Pre-Send Verification
- [ ] All formatting correct
- [ ] No typos or errors in name/titles
- [ ] Candidate email address verified
- [ ] Acceptance deadline is realistic
- [ ] Salary figures double-checked
- [ ] DocuSeal template created successfully
- [ ] Signature fields properly configured in DocuSeal

### Communication Preparation
- [ ] HR team prepared to answer candidate questions
- [ ] FAQ document prepared (common questions about benefits, probation, etc.)
- [ ] Expected timeline for decision communicated
- [ ] Next steps after acceptance explained

### Record Keeping
- [ ] Save signed template for record
- [ ] Store acceptance/decline decision
- [ ] Track all negotiations (if applicable)
- [ ] Archive final executed contract
- [ ] Note any deviations from template

---

## Common Issues & Resolutions

### Issue: Probation Period Warning Appears
**Resolution**: 
- Verify if probation > 180 days is intentional
- If intentional, document business reason
- Consider escalating to Legal/CEO for approval
- For rank-and-file: Must be ≤ 180 days per Art. 281

### Issue: Night Differential Validation Fails
**Resolution**:
- Check: Is this a night shift role?
- If yes: Minimum 10% of hourly rate required (RA 11165)
- If no: Can be 0%

### Issue: Candidate Questions 13th Month
**Response Template**:
"The 13th month pay is mandated by P.D. 851 (Presidential Decree No. 851) and is a legal requirement for all employees. It's typically equivalent to 1/12 of your annual salary and is paid during December or as specified by company policy."

### Issue: Candidate Asks About Non-Compete Clause
**Response Template**:
"The non-compete clause is in place to protect company intellectual property and trade secrets. It's valid for [X years] after your employment ends and applies only to [defined competitors/industries]. This is enforceable under Philippine law if reasonable."

### Issue: Candidate Declines Offer
**Process**:
- [ ] Note reason for decline
- [ ] Ask for feedback (keep relationship positive)
- [ ] Archive offer letter and communications
- [ ] Adjust future offers if pattern emerges

---

## Monthly/Quarterly Reviews

### Template Effectiveness
- [ ] How many offers sent? How many accepted?
- [ ] Average time from offer to acceptance/decline
- [ ] Common negotiation points identified
- [ ] Template sections needing updates

### Compliance Monitoring
- [ ] All created offers compliant with PH Labor Law ✓
- [ ] No "at-will" language accidentally included
- [ ] Probation periods consistently enforced
- [ ] Mandatory benefits never removed
- [ ] DOLE/SSS/PhilHealth requirements met

### Updates Needed
- [ ] New minimum wage changes: **UPDATE TEMPLATE**
- [ ] Legal changes to Labor Code: **UPDATE TEMPLATE**
- [ ] Policy changes: **UPDATE TEMPLATE**
- [ ] New benefits added: **UPDATE TEMPLATE**

---

## Training Checklist for New HR Staff

**Upon Onboarding, Ensure HR Staff Can:**
- [ ] Access and use the OfferLetterPhAccordion component
- [ ] Understand each section's requirements
- [ ] Identify PH Labor Law compliance checkpoints
- [ ] Know when/why alerts appear
- [ ] Handle custom vs. standard termination language
- [ ] Troubleshoot common validation errors
- [ ] Know escalation procedures for exceptions
- [ ] Answer candidate FAQs about compliance

---

## Escalation Procedures

### When to Escalate to Legal:
- [ ] Custom termination language requested
- [ ] Probation period > 180 days desired
- [ ] Non-compete clause modification needed
- [ ] Benefits package modification (mandatory benefits)
- [ ] Special arrangement for salary/benefits

### When to Escalate to Finance:
- [ ] Salary exceeds budgeted range
- [ ] Complex compensation structure (multi-currency, stock options)
- [ ] Unusual benefits package
- [ ] Probationary period exceptions

### When to Escalate to CEO:
- [ ] Salary > [company threshold]
- [ ] Executive-level positions
- [ ] Key hires
- [ ] Critical role backfills

---

## Success Metrics

Track these metrics for template effectiveness:

| Metric | Target | Current |
|--------|--------|---------|
| Compliance violations | 0% | ___ % |
| Offer acceptance rate | 80%+ | ___ % |
| Time to first offer send | < 5 days | ___ days |
| Candidate questions (avg) | < 2 | ___ |
| Negotiation frequency | < 20% | ___ % |
| Legal escalations | < 5% | ___ % |

---

**Document Version**: 1.0  
**Last Updated**: May 2026  
**Next Review**: August 2026  
**Owner**: HR Department
