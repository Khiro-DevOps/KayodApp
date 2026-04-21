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
  const supabase = await createClient();
  const admin = getAdminClient();
  const email     = formData.get("email") as string;
  const password  = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName  = formData.get("last_name") as string;
  const dateOfBirthInput = (formData.get("date_of_birth") as string) || "";
  const ageInput = (formData.get("age") as string) || "";
  const address = (formData.get("address") as string) || "";
  const city = (formData.get("city") as string) || "";
  const country = ((formData.get("country") as string) || "Philippines").trim();
  const rawPhone  = formData.get("phone") as string;
  const role      = (formData.get("role") as string) || "candidate";
  const phone     = formatPhilippinesPhone(rawPhone);
  const dateOfBirth = dateOfBirthInput.trim();
  const ageText = ageInput.trim();
  const age = Number(ageText);
  const normalizedAddress = address.trim();
  const normalizedCity = city.trim();

  // Server-side validation
  if (
    !email ||
    !password ||
    !firstName ||
    !lastName ||
    !rawPhone ||
    !dateOfBirth ||
    !ageText ||
    !normalizedAddress ||
    !normalizedCity ||
    !country
  ) {
    redirect(`/register?error=${encodeURIComponent("All fields are required")}`);
  }

  if (password.length < 6) {
    redirect(`/register?error=${encodeURIComponent("Password must be at least 6 characters")}`);
  }

  const validRoles = ["candidate", "hr_manager"];
  if (!validRoles.includes(role)) {
    redirect(`/register?error=${encodeURIComponent("Invalid role selected")}`);
  }

  const digitsOnly = rawPhone.replace(/\D/g, "");
  const validPhoneLength =
    digitsOnly.length === 10 ||
    digitsOnly.length === 11 ||
    (digitsOnly.length === 12 && digitsOnly.startsWith("63"));

  if (!validPhoneLength || phone.length === 0) {
    redirect(`/register?error=${encodeURIComponent("Enter a valid Philippine phone number")}`);
  }

  if (!Number.isInteger(age) || age < 0 || age > 120) {
    redirect(`/register?error=${encodeURIComponent("Age must be a whole number between 0 and 120")}`);
  }

  const birthdate = new Date(dateOfBirth);
  if (Number.isNaN(birthdate.getTime())) {
    redirect(`/register?error=${encodeURIComponent("Enter a valid birthdate")}`);
  }

  const today = new Date();
  let computedAge = today.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthdate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthdate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    computedAge -= 1;
  }

  if (Math.abs(computedAge - age) > 1) {
    redirect(`/register?error=${encodeURIComponent("Age does not match birthdate")}`);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name:  lastName,
        phone:      phone,
        role:       role,
        age,
        date_of_birth: dateOfBirth,
        address: normalizedAddress,
        city: normalizedCity,
        country,
      },
    },
  });

  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);

  // Ensure profiles row has phone/name/role even if DB trigger is outdated or missing.
  if (data.user?.id) {
    const { error: profileSyncError } = await admin
      .from("profiles")
      .upsert(
        {
          id: data.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          role,
          age,
          date_of_birth: dateOfBirth,
          address: normalizedAddress,
          city: normalizedCity,
          country,
        },
        { onConflict: "id" }
      );

    if (profileSyncError) {
      redirect(`/register?error=${encodeURIComponent(profileSyncError.message)}`);
    }
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}