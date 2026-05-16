import Handlebars from "handlebars";
import { format } from "date-fns";

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

// Currency formatting helper
Handlebars.registerHelper("currency", function (amount, currencyCode = "PHP") {
  if (amount == null) return "";
  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: typeof currencyCode === "string" ? currencyCode : "PHP",
  });
  return formatter.format(Number(amount));
});

// Date formatting helper
Handlebars.registerHelper("formatDate", function (dateString, formatString = "MMMM dd, yyyy") {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), typeof formatString === "string" ? formatString : "MMMM dd, yyyy");
  } catch (error) {
    return dateString;
  }
});

// Default value fallback helper
Handlebars.registerHelper("default", function (value, defaultValue) {
  return value || defaultValue;
});

// JSON stringify helper (useful for debugging or advanced mapping)
Handlebars.registerHelper("json", function (context) {
  return JSON.stringify(context);
});

// Case comparison helper
Handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

// ============================================================================
// OFFER TEMPLATE INTERPOLATION
// ============================================================================

/**
 * Interface representing the complete Offer context required for interpolation.
 * These map to the JSONB fields in our job_offers database schema.
 */
export interface OfferContext {
  job_metadata: Record<string, any>;
  org_hierarchy: Record<string, any>;
  financial_package: Record<string, any>;
  logistics: Record<string, any>;
  benefits_config: Record<string, any>;
  legal_clauses: Record<string, any>;
  workflow_meta: Record<string, any>;
  candidate: Record<string, any>; // Basic candidate info injected at runtime
  company: Record<string, any>;   // Basic company info injected at runtime
}

/**
 * Compiles and interpolates a Handlebars template string with the provided offer context.
 * 
 * @param templateString The raw Handlebars template string (e.g. Markdown or HTML)
 * @param context The OfferContext containing all relevant schema segments
 * @returns The rendered document string
 */
export function generateDynamicOfferDocument(
  templateString: string,
  context: OfferContext
): string {
  // Compile the template
  const template = Handlebars.compile(templateString, {
    noEscape: true, // We want raw text/markdown mostly, so disable HTML escaping by default unless needed
    strict: false,
  });

  // Execute and return the interpolated string
  return template(context);
}
