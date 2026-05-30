import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/auth/callback"];

// Route prefixes that don't require authentication
// Include `/register` so subroutes like `/register/applicant` are public
// Also allow `/api/register` so client-side registration POSTs are not redirected to /login
const publicPrefixes = ["/api/webhooks", "/register", "/api/register"];

// In development, also allow dev routes to bypass auth
const devPrefixes = process.env.NODE_ENV === "development" ? ["/api/dev", "/dev"] : [];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[Middleware] Missing Supabase credentials");
      return supabaseResponse;
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
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

    if (authError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Middleware] Auth error:", authError.message);
      }
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
    // Note: keep `/` public so the landing page remains visible even for authenticated users.
    if (user && (pathname === "/login" || pathname === "/register")) {
      const url = new URL("/dashboard", request.url);
      url.search = "";
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
