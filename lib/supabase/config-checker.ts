/**
 * Supabase Configuration Checker
 * Helps diagnose "Failed to fetch" errors during token refresh
 */

export function validateSupabaseConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is not set");
  } else if (!supabaseUrl.includes("supabase.co")) {
    warnings.push(
      "NEXT_PUBLIC_SUPABASE_URL does not appear to be a valid Supabase URL"
    );
  }

  if (!supabaseAnonKey) {
    errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  } else if (supabaseAnonKey.length < 20) {
    warnings.push("NEXT_PUBLIC_SUPABASE_ANON_KEY appears to be incomplete");
  }

  // Check that we're in a browser environment if checking at runtime
  if (typeof window === "undefined") {
    warnings.push("Validation is being run in a non-browser environment");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log Supabase configuration status (development only)
 */
export function logSupabaseStatus(): void {
  if (process.env.NODE_ENV !== "development") return;

  const validation = validateSupabaseConfig();

  if (validation.errors.length > 0) {
    console.error(
      "[Supabase Config] Errors:",
      validation.errors.join(", ")
    );
  }

  if (validation.warnings.length > 0) {
    console.warn(
      "[Supabase Config] Warnings:",
      validation.warnings.join(", ")
    );
  }

  if (validation.valid) {
    console.log("[Supabase Config] Configuration is valid");
  }
}
