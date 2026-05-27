import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);

function toStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function deleteUpload(adminClient: ReturnType<typeof getAdminClient>, path: string | null) {
  if (!path) {
    return;
  }

  await adminClient.storage.from("company-logos").remove([path]);
}

async function removeTenantRow(adminClient: ReturnType<typeof getAdminClient>, tenantId: string | null) {
  if (!tenantId) {
    return;
  }

  await adminClient.from("tenants").delete().eq("id", tenantId);
  await adminClient.from("companies").delete().eq("id", tenantId);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const adminFullName = toStringValue(formData.get("adminFullName"));
    const companyName = toStringValue(formData.get("companyName"));
    const email = toStringValue(formData.get("email"));
    const password = toStringValue(formData.get("password"));
    const confirmPassword = toStringValue(formData.get("confirmPassword"));
    const rawPlan = toStringValue(formData.get("plan"));
    const plan: SubscriptionPlan = isSubscriptionPlan(rawPlan) ? rawPlan : "starter";
    const logoFile = formData.get("logoFile");

    if (!companyName) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    if (!adminFullName) {
      return NextResponse.json({ error: "HR admin full name is required." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    if (!(logoFile instanceof File)) {
      return NextResponse.json({ error: "Company logo is required." }, { status: 400 });
    }

    if (!ALLOWED_LOGO_TYPES.has(logoFile.type)) {
      return NextResponse.json({ error: "Logo must be a PNG or JPG file." }, { status: 400 });
    }

    if (logoFile.size > MAX_LOGO_SIZE_BYTES) {
      return NextResponse.json({ error: "Logo must be 2MB or smaller." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const logoPath = `company-logos/${crypto.randomUUID()}`;
    const uploadBody = Buffer.from(await logoFile.arrayBuffer());

    const { error: uploadError } = await adminClient.storage.from("company-logos").upload(logoPath, uploadBody, {
      contentType: logoFile.type,
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicLogo } = adminClient.storage.from("company-logos").getPublicUrl(logoPath);
    const logoUrl = publicLogo.publicUrl || logoPath;

    const { data: tenantRow, error: tenantError } = await adminClient
      .from("tenants")
      .insert({
        name: companyName,
        logo_url: logoUrl,
        plan,
        plan_expires_at: planExpiresAt,
      })
      .select("id")
      .single<{ id: string }>();

    if (tenantError || !tenantRow) {
      await deleteUpload(adminClient, logoPath);
      return NextResponse.json({ error: tenantError?.message || "Failed to create tenant record." }, { status: 500 });
    }

    const { error: companiesError } = await adminClient.from("companies").insert({
      name: companyName,
      logo_url: logoUrl,
      plan,
      plan_expires_at: planExpiresAt,
    });

    if (companiesError) {
      console.warn("[register/hr] companies mirror insert failed:", companiesError.message);
    }

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName,
        first_name: adminFullName.split(/\s+/)[0] ?? adminFullName,
        last_name: adminFullName.split(/\s+/).slice(1).join(" ") || "",
        role: "hr_manager",
        tenant_id: tenantRow.id,
        company_name: companyName,
        plan,
      },
    });

    if (authError || !authUser.user) {
      await removeTenantRow(adminClient, tenantRow.id);
      await deleteUpload(adminClient, logoPath);
      return NextResponse.json({ error: authError?.message || "Failed to create the HR account." }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        companyName,
        plan,
        planExpiresAt,
        logoUrl,
        tenantId: tenantRow.id,
        userId: authUser.user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected registration failure." },
      { status: 500 }
    );
  }
}