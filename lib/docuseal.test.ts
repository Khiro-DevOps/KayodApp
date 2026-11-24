import { describe, expect, it } from "vitest";
import {
  buildOfferLetterHtml,
  buildOfferPrefillFields,
  OFFER_TEMPLATE_VERSION,
  REQUIRED_OFFER_TEMPLATE_FIELDS,
} from "@/lib/docuseal";

describe("DocuSeal offer contract template & prefill alignment", () => {
  it("renders a single unified HTML contract with reporting_line, allowances, leave_credits, and hmo_coverage at 100% width and 13px font", () => {
    const html = buildOfferLetterHtml(
      {
        jobTitle: "Junior Frontend Developer (React & Next.js)",
        department: "Engineering",
        employmentType: "full_time",
        location: "9eba7f40-c0c3-4fe8-af6b-84810544f941",
        salary_min: 28000,
        salary_max: 35000,
        currency: "PHP",
      },
      { name: "SG Engineering" }
    );

    expect(OFFER_TEMPLATE_VERSION).toBe("v3-formal-ph-contract");
    expect(html).toContain(`(${OFFER_TEMPLATE_VERSION})`);

    // Required term fields exist with full-width, non-shrinking 13px styling
    for (const fieldName of [
      "reporting_line",
      "allowances",
      "leave_credits",
      "hmo_coverage",
      "work_location",
      "work_schedule_summary",
    ]) {
      expect(html).toContain(`name="${fieldName}"`);
    }

    expect(html).toContain("width: 100%");
    expect(html).toContain("font-size: 13px");
    expect(html).toContain('<col style="width: 32%;">');
    expect(html).toContain('<col style="width: 68%;">');

    // No raw slugs, UUIDs, or duplicate Salary Range summary table
    expect(html).not.toContain("full_time");
    expect(html).not.toContain("9eba7f40-c0c3-4fe8-af6b-84810544f941");
    expect(html).not.toContain("Salary Range");
  });

  it("matches 100% of buildOfferPrefillFields keys to active <text-field> tags in buildOfferLetterHtml with zero orphaned keys", () => {
    const html = buildOfferLetterHtml(
      {
        jobTitle: "Senior Data Analyst",
        employmentType: "full_time",
        currency: "PHP",
      },
      { name: "SG Engineering" }
    );

    const prefill = buildOfferPrefillFields(
      {
        salary: 45000,
        start_date: "2026-12-01",
        work_setup: "hybrid",
        department: "Analytics",
        probation_days: 180,
        shift_start: "08:00",
        shift_end: "17:00",
        work_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        job_metadata: {
          reports_to_label: "Jay Gomez — Senior Data Analyst (Team Lead)",
          target_job_level: "team_lead",
          service_incentive_leave: 5,
          vacation_leave_days: 15,
          sick_leave_days: 15,
          hmo_provider: "Maxicare HMO (Day 1)",
        },
      },
      {
        title: "Senior Data Analyst",
        currency: "PHP",
        location: "9eba7f40-c0c3-4fe8-af6b-84810544f941",
        employment_type: "full_time",
        company_name: "SG Engineering",
      },
      {
        first_name: "Juan",
        last_name: "Dela Cruz",
        email: "juan@example.com",
      },
      {
        name: "Cebu IT Park HQ",
        address: "Apas, Cebu City",
      }
    );

    const htmlFieldMatches = Array.from(
      html.matchAll(/<(?:text|date|signature)-field\s+[^>]*name="([^"]+)"/g)
    ).map((m) => m[1]);
    const htmlFieldSet = new Set(htmlFieldMatches);

    // Zero orphaned prefill keys
    for (const key of Object.keys(prefill)) {
      expect(htmlFieldSet.has(key)).toBe(true);
    }

    // All required fields are present in HTML
    for (const reqField of REQUIRED_OFFER_TEMPLATE_FIELDS) {
      expect(htmlFieldSet.has(reqField)).toBe(true);
    }

    // Clean human-readable values
    expect(prefill.employment_type).toBe("Full-Time");
    expect(prefill.work_location).toBe("Cebu IT Park HQ — Apas, Cebu City");
    expect(prefill.reporting_line).toBe("Jay Gomez — Senior Data Analyst (Team Lead)");
    expect(prefill.leave_credits).toContain("15 VL / year");
    expect(prefill.leave_credits).toContain("15 SL / year");
    expect(prefill.hmo_coverage).toBe("Maxicare HMO (Day 1)");
  });
});
