"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email    = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);

  redirect("/dashboard");
}

export async function register(formData: FormData) {
  const supabase = await createClient();

  const email     = formData.get("email") as string;
  const password  = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName  = formData.get("last_name") as string;
  const role      = (formData.get("role") as string) || "candidate";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, role },
    },
  });

  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
