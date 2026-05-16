# Philippine Labor Law Compliance - Quick Reference

## Implemented Validations

### Art. 281: Probation Period Limit
**Rule**: Probation period shall not exceed six (6) months for rank-and-file employees
**Implementation**: 
- Maximum 180 days in probation field
- Warning displayed if > 180 days
- Applies to: Probationary employment status only

### P.D. 851: 13th Month Pay
**Rule**: All workers in private sector are entitled to 13th month pay (minimum 1/12 of annual basic salary)
**Implementation**:
- Mandatory checkbox (default: TRUE)
- Cannot be unchecked
- Applies to: All employment statuses
- Formula: Annual salary ÷ 12

### RA 7875: Social Security Benefits
**Rule**: Mandatory enrollment in:
- SSS (Social Security System)
- PhilHealth (Health Insurance)
- Pag-IBIG (Home Development Mutual Fund)
**Implementation**:
- Green-highlighted mandatory benefits section
- Pre-checked by default
- Employee must contribute minimum share
- Employer co-contribution required

### RA 11165: Night Differential
**Rule**: Workers paid by hour shall be paid at least 10% night shift differential
**Implementation**:
- Minimum validation: 10%
- Maximum: 100%
- Calculated on hourly/shift basis
- Alert shown: "Per RA 11165, minimum night differential is 10% (₱X.XX)"

### Labor Code Art. 282-283: Termination Grounds
**Rule**: 
- Art. 282 (Just Cause): Willful disobedience, gross negligence, fraud, crime, drunkenness, etc.
- Art. 283 (Authorized Cause): Installation of labor-saving devices, redundancy, retrenchment, cessation of business
**Implementation**:
- Standard Labor Code language enforced (recommended)
- Custom clause requires legal review warning
- Cannot use "at-will" employment terms
- Must reference both Art. 282 and 283

## Compliance Checklist

Use this during form completion:

- [ ] **Employment Terms**: Probation ≤ 180 days?
- [ ] **Compensation**: 13th month pay enabled?
- [ ] **Benefits**: SSS, PhilHealth, Pag-IBIG all checked?
- [ ] **Compensation**: Night differential ≥ 10% (if applicable)?
- [ ] **Termination**: Using Labor Code standard language?
- [ ] **Job Details**: Clear job responsibilities documented?
- [ ] **Start Date**: Valid future date selected?

## Common Scenarios

### Regular Full-Time Employee
```
Employment Status: Regular
Probation Period: 0 (no probation) or up to 180 days
13th Month: ✓ (Mandatory)
SSS/PhilHealth/Pag-IBIG: ✓ (Mandatory)
Night Differential: 10% (if night shift)
Termination: Standard Labor Code language
```

### Probationary Employee
```
Employment Status: Probationary
Probation Period: 30-180 days
13th Month: ✓ (Mandatory)
SSS/PhilHealth/Pag-IBIG: ✓ (Mandatory)
Termination: Art. 282/283 applies
```

### Project-based / Contractual
```
Employment Status: Project-based / Contract
Probation Period: 0 (contracts are time-bound)
13th Month: ✓ (Mandatory)
SSS/PhilHealth/Pag-IBIG: ✓ (Mandatory if applicable)
Termination: Per contract expiration
```

### Sales/Commission Role
```
Employment Status: Regular
Commission Structure: Document clearly (e.g., "5% of sales")
Night Differential: N/A (if not night shift)
13th Month: ✓ (Mandatory - on basic salary)
```

## Penalty Summary

| Violation | Penalty |
|-----------|---------|
| Excessive probation period | Fine + reinstatement with backwages |
| Non-payment of 13th month | Liability + penalties + interest |
| Non-enrollment SSS/PhilHealth | Employer liability + fines |
| Illegal termination | Separation pay + backwages + damages |
| "At-will" clause | Void; full Labor Code protections apply |

## Additional Requirements

### Pre-Employment Requirements
- NBI/Police Clearance: Optional (per company policy)
- Medical Exam: Recommended for all positions
- Drug Test: Allowed but must comply with DOLE guidelines
- TOR/Diploma Verification: For positions requiring education
- NDA: Can be required; must be reasonable in scope
- Non-compete: Can be required; max 2-year period post-employment (subject to reasonableness test)

### Employment Contract Best Practices
1. **Written Contract**: Document all terms in writing (PH Labor Code requirement)
2. **Two Copies**: Employee and employer copies
3. **Clear Terms**: Salary, duties, working hours, work location
4. **Compliance Language**: Reference Labor Code provisions
5. **Signatures**: Employee and employer authorized signatories

## When This Template Auto-Validates

✅ Form submission blocked if:
- Probation > 180 days (Art. 281)
- Night differential < 10% for night shifts (RA 11165)
- Required fields empty (job title, salary, etc.)
- Invalid dates
- Numeric values out of range

✅ Warnings shown (but submission allowed):
- Probation period close to limit
- Non-standard termination language
- Missing optional recommended fields

## Resources

- **PH Labor Code**: laws.gov.ph
- **DOLE Guidelines**: www.dole.gov.ph
- **SSS**: www.sss.gov.ph
- **PhilHealth**: www.philhealth.gov.ph
- **Pag-IBIG**: www.pagibigfundph.com
