import { NextResponse } from "next/server";
import { validateSupabaseConfig } from "@/lib/supabase/config-checker";

/**
 * Debug endpoint to check Supabase configuration and connectivity
 * GET /api/dev/supabase-health
 */
export async function GET() {
  // Only available in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

  const config = validateSupabaseConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  try {
    // Try to reach Supabase URL
    let urlReachable = false;
    let urlError: string | null = null;

    if (supabaseUrl) {
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: "HEAD",
          headers: {
            "User-Agent": "Supabase-Health-Check",
          },
        });
        urlReachable = response.ok || response.status === 401; // 401 is expected if not authenticated
      } catch (error) {
        urlError = error instanceof Error ? error.message : "Unknown error";
      }
    }

    return NextResponse.json({
      config,
      connectivity: {
        supabaseUrl,
        urlReachable,
        urlError,
      },
      status: config.valid && urlReachable ? "healthy" : "unhealthy",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Health check failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
