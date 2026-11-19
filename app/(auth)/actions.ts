"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";
import { effectiveRole } from "@/lib/roles";
import { safeNext } from "@/lib/safe-redirect";

function mapLoginErrorMessage(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("email not confirmed") || normalized.includes("not confirmed")) {
    return "Please confirm your email address before logging in.";
  }
  return "Wrong email or password.";
}

export async function login(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const supabase = await createClient();
  const email = (formData.get("email") as string) ?? "";
  const password = (formData.get("password") as string) ?? "";
  const next = (formData.get("next") as string | null) ?? null;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return {
      error: mapLoginErrorMessage(error?.message ?? ""),
      success: false,
    };
  }

  const rawMetadata = ((data.user as { raw_user_meta_data?: Record<string, unknown> })
    .raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authRole = (data.user.user_metadata?.role ?? rawMetadata.role) as string | undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle<{ role?: string | null }>();

  const role = effectiveRole(profile?.role, authRole);
  redirect(safeNext(next, role));
}

function formatPhilippinesPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits === "0") return "0";
  if (digits === "63") return "+63";

  let local = digits;
  if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else if (digits.startsWith("63")) {
    local = digits.slice(2);
  }

  local = local.slice(0, 10);

  if (!local) return digits;
  if (local.length <= 3) return `+63 ${local}`.trim();
  if (local.length <= 6) return `+63 ${local.slice(0, 3)} ${local.slice(3)}`;
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export async function register(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
) {
  const supabase = await createClient();

  // 1. Extract form data
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string; // 'candidate' or 'hr_manager'
  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const dob = formData.get("date_of_birth") as string;
  const age = formData.get("age") as string;
  const address = formData.get("address") as string;
  const city = formData.get("city") as string;
  const country = formData.get("country") as string;
  const tenantName = formData.get("tenant_name") as string;
  const rawPlan = formData.get("plan") as string | null;
  const next = (formData.get("next") as string | null) ?? null;
  const plan: SubscriptionPlan = isSubscriptionPlan(rawPlan) ? rawPlan : "starter";
  const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  let tenantId = null;

  // 2. If HR, create the tenant record first
  if (role === "hr_manager" && tenantName) {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: tenantName,
        plan,
        plan_expires_at: planExpiresAt,
      })
      .select("id")
      .single();

    if (tenantError) {
      return redirect(`/register?error=${encodeURIComponent("Failed to create tenant record.")}`);
    }
    tenantId = tenant.id;
  }

  // 3. Sign up the Auth user
  // This triggers your 'handle_new_user' function in Postgres
  // NOTE: tenant_id is passed in metadata to be extracted by the trigger
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const safeRedirectTarget = safeNext(next, role);
  const emailRedirectTo = appUrl
    ? `${appUrl}/auth/callback?next=${encodeURIComponent(safeRedirectTarget)}`
    : undefined;

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        role: role,
        date_of_birth: dob,
        age: age,
        address: address,
        city: city,
        country: country,
        // Pass tenant_id to the trigger so it saves to profiles.tenant_id
        tenant_id: tenantId,
      },
    },
  });

  if (signUpError) {
    const errorBase = role === "candidate" ? "/register/applicant" : "/register";
    const nextQuery = next ? `&next=${encodeURIComponent(next)}` : "";
    return redirect(`${errorBase}?error=${encodeURIComponent(signUpError.message)}${nextQuery}`);
  }

  // 4. Success! Redirect to safe destination or role home
  return redirect(safeRedirectTarget);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}