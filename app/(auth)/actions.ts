"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email    = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
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

export async function register(formData: FormData) {
  const supabase = await createServerActionClient({ cookies });

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
  const companyName = formData.get("company_name") as string;

  let tenantId = null;

  // 2. If HR, create the Tenant (Company) first
  if (role === "hr_manager" && companyName) {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({ name: companyName })
      .select('id')
      .single();

    if (tenantError) {
      return redirect(`/register?error=${encodeURIComponent("Failed to create company record.")}`);
    }
    tenantId = tenant.id;
  }

  // 3. Sign up the Auth user
  // This triggers your 'handle_new_user' function in Postgres
  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
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
        tenant_id: tenantId, // Passed to metadata for the SQL trigger
      },
    },
  });

  if (signUpError) {
    return redirect(`/register?error=${encodeURIComponent(signUpError.message)}`);
  }

  // 4. Success! Redirect to dashboard or verification page
  return redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}