"use server";

import { redirect } from "next/navigation";
import { extractText } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";
import { effectiveRole } from "@/lib/roles";
import { safeNext } from "@/lib/safe-redirect";
import { acceptHrInviteAtomic, registerHrWorkspaceAtomic } from "@/app/(auth)/register/hr/actions";

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

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function saveOptionalRegistrationResume(
  userId: string,
  fullName: string,
  resumeFile: File
): Promise<void> {
  const adminClient = getAdminClient();
  const bucket = getResumeBucketName();
  const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "resume.pdf";
  const storagePath = `${userId}/${Date.now()}_${safeName}`;
  const arrayBuffer = await resumeFile.arrayBuffer();

  let extractedText = "";
  try {
    if (resumeFile.type === "application/pdf" || safeName.toLowerCase().endsWith(".pdf")) {
      const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
      extractedText = text ?? "";
    } else if (resumeFile.type.startsWith("text/") || safeName.toLowerCase().endsWith(".txt")) {
      extractedText = new TextDecoder().decode(arrayBuffer);
    }
  } catch (extractErr) {
    console.warn("[register] resume text extraction warning:", extractErr);
  }

  let publicUrl: string | null = null;
  try {
    const { error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: resumeFile.type || "application/pdf",
        upsert: false,
      });

    if (!uploadError) {
      const { data } = adminClient.storage.from(bucket).getPublicUrl(storagePath);
      publicUrl = data.publicUrl || null;
    } else {
      console.warn("[register] resume storage upload warning:", uploadError.message);
    }
  } catch (storageErr) {
    console.warn("[register] resume storage exception:", storageErr);
  }

  const { error: dbError } = await adminClient.from("resumes").insert({
    candidate_id: userId,
    title: fullName ? `${fullName} - Resume` : safeName,
    input_data: {
      source: "registration_upload",
      file_name: resumeFile.name,
    },
    generated_content: {},
    content_text: extractedText.trim().slice(0, 50000) || null,
    pdf_url: publicUrl,
    is_primary: true,
  });

  if (dbError) {
    console.warn("[register] resume insert warning:", dbError.message);
  }
}

export async function register(
  _prevState: { error: string | null; success: boolean },
  formData: FormData
): Promise<{ error: string | null; success: boolean }> {
  const supabase = await createClient();

  const email = getStringField(formData, "email");
  const password = getStringField(formData, "password");
  const role = getStringField(formData, "role") || "candidate";
  const firstName = getStringField(formData, "first_name");
  const lastName = getStringField(formData, "last_name");
  const phone = getStringField(formData, "phone");
  const dob = getStringField(formData, "date_of_birth");
  const age = getStringField(formData, "age");
  const gender = getStringField(formData, "gender") || null;
  const civilStatus = getStringField(formData, "civil_status") || null;
  const address = getStringField(formData, "address");
  const city = getStringField(formData, "city");
  const country = getStringField(formData, "country") || "Philippines";
  const provinceId = getStringField(formData, "province_id") || null;
  const cityId = getStringField(formData, "city_id") || null;
  const workSetup = getStringField(formData, "work_setup") || null;
  const privacyConsent = getStringField(formData, "privacy_consent");
  const privacyConsentVersion = getStringField(formData, "privacy_consent_version") || "v1.0";
  const privacyConsentedAt =
    getStringField(formData, "privacy_consented_at") || new Date().toISOString();
  const tenantName = getStringField(formData, "tenant_name") || getStringField(formData, "companyName");
  const industry = getStringField(formData, "industry") || null;
  const companySize = getStringField(formData, "company_size") || getStringField(formData, "companySize") || null;
  const rawPlan = formData.get("plan") as string | null;
  const next = getStringField(formData, "next") || null;
  const resumeFile = formData.get("resume_file");

  if (!firstName || !lastName) {
    return { error: "First name and last name are required.", success: false };
  }

  if (!email || !password) {
    return { error: "Email and password are required.", success: false };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: false };
  }

  if (role === "candidate" && dob) {
    const dobDate = new Date(dob);
    if (!Number.isNaN(dobDate.getTime())) {
      const today = new Date();
      let calcAge = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        calcAge--;
      }
      if (calcAge < 18) {
        return { error: "Applicants must be at least 18 years old.", success: false };
      }
    }
  }

  if (role === "candidate" && privacyConsent !== "on" && privacyConsent !== "true") {
    return { error: "Please accept the Privacy Notice to create an account.", success: false };
  }

  const plan: SubscriptionPlan = isSubscriptionPlan(rawPlan) ? rawPlan : "starter";
  const inviteToken = getStringField(formData, "invite_token") || getStringField(formData, "invite");
  const safeRedirectTarget = safeNext(next, role);

  if (role === "hr_manager") {
    if (inviteToken) {
      const inviteRes = await acceptHrInviteAtomic({
        inviteToken,
        firstName,
        lastName,
        phone,
        password,
      });
      if (!inviteRes.success) {
        return { error: inviteRes.error || "Unable to accept HR invite.", success: false };
      }
      await supabase.auth.signInWithPassword({
        email: inviteRes.email || email,
        password,
      });
      redirect(safeRedirectTarget);
    }

    if (!tenantName) {
      return { error: "Company name is required.", success: false };
    }

    const resolvedAddress = [address, city, country].filter(Boolean).join(", ") || address || null;
    const hrRes = await registerHrWorkspaceAtomic({
      companyName: tenantName,
      industry,
      companySize,
      address: resolvedAddress,
      firstName,
      lastName,
      phone,
      email,
      password,
      plan,
    });

    if (!hrRes.success) {
      return { error: hrRes.error || "Failed to create HR workspace.", success: false };
    }

    await supabase.auth.signInWithPassword({ email, password });
    redirect(safeRedirectTarget);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const emailRedirectTo = appUrl
    ? `${appUrl}/auth/callback?next=${encodeURIComponent(safeRedirectTarget)}`
    : undefined;

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
        role,
        date_of_birth: dob || null,
        age: age || null,
        gender,
        civil_status: civilStatus,
        address: address || null,
        city: city || null,
        country,
        work_setup: workSetup,
        province_id: provinceId,
        city_id: cityId,
        tenant_id: null,
        privacy_consent_version: privacyConsentVersion,
        privacy_consented_at: privacyConsentedAt,
      },
    },
  });

  if (signUpError) {
    return { error: signUpError.message, success: false };
  }

  if (signUpData.user && resumeFile instanceof File && resumeFile.size > 0) {
    try {
      await saveOptionalRegistrationResume(
        signUpData.user.id,
        `${firstName} ${lastName}`.trim(),
        resumeFile
      );
    } catch (err) {
      console.warn("[register] optional resume save failed:", err);
    }
  }

  redirect(safeRedirectTarget);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
