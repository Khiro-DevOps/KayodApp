import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/auth/callback"];

// Route prefixes that don't require authentication
const publicPrefixes = ["/api/webhooks"];

// In development, also allow dev routes to bypass auth
const devPrefixes = process.env.NODE_ENV === "development" ? ["/api/dev", "/dev"] : [];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.REDACTED_NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError && process.env.NODE_ENV === "development") {
      console.error("[Middleware] Auth error:", authError);
    }

    const pathname = request.nextUrl.pathname;
    const isPublicRoute = publicRoutes.includes(pathname);
    const isPublicPrefix = publicPrefixes.some((prefix) =>
      pathname.startsWith(prefix)
    );
    const isDevPrefix = devPrefixes.some((prefix) =>
      pathname.startsWith(prefix)
    );

    // If user is not authenticated and trying to access protected route
    if (!user && !isPublicRoute && !isPublicPrefix && !isDevPrefix) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // If user is authenticated and trying to access auth pages, redirect to dashboard
    if (user && (pathname === "/login" || pathname === "/register" || pathname === "/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    console.error("[Middleware] Unexpected error:", error);
    // Allow the request to proceed even if there's an error
    // The browser client will handle authentication
    return supabaseResponse;
  }
}
