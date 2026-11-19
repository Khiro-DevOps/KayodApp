import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { effectiveRole } from "@/lib/roles";
import { safeNext } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      let role: string | null = null;
      if (user) {
        const rawMetadata = ((user as { raw_user_meta_data?: Record<string, unknown> })
          .raw_user_meta_data ?? {}) as Record<string, unknown>;
        const authRole = (user.user_metadata?.role ?? rawMetadata.role) as string | undefined;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle<{ role?: string | null }>();
        role = effectiveRole(profile?.role, authRole);
      }

      const destination = safeNext(nextParam, role);
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could+not+authenticate`);
}
