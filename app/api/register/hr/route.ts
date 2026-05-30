import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);

function toStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function slugifyWorkspace(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveFirstName(firstName: string, adminFullName: string) {
  return firstName || adminFullName.split(/\s+/)[0] || adminFullName;
}

function deriveLastName(lastName: string, adminFullName: string) {
  return lastName || adminFullName.split(/\s+/).slice(1).join(" ");
}

async function deleteUpload(adminClient: ReturnType<typeof getAdminClient>, path: string | null) {
  if (!path) {
    return;
  }

  await adminClient.storage.from("company-logos").remove([path]);
}

async function removeTenantRow(
  adminClient: ReturnType<typeof getAdminClient>,
  tenantId: string | null,
  companyName: string | null
) {
  if (!tenantId) {
    return;
  }

  await adminClient.from("tenants").delete().eq("id", tenantId);

  if (companyName) {
    await adminClient.from("companies").delete().eq("name", companyName);
  }
}

export async function POST(request: Request) {
  try {
    console.info("[register/hr] POST handler invoked");
    const formData = await request.formData();
    const firstName = toStringValue(formData.get("firstName"));
    const lastName = toStringValue(formData.get("lastName"));
    const adminFullName = toStringValue(formData.get("adminFullName")) || [firstName, lastName].filter(Boolean).join(" ").trim();
    const companyName = toStringValue(formData.get("companyName"));
    const email = toStringValue(formData.get("workEmail")) || toStringValue(formData.get("email"));
    const password = toStringValue(formData.get("password"));
    const confirmPassword = toStringValue(formData.get("confirmPassword"));
    const workspaceSlug = toStringValue(formData.get("workspaceSlug")) || slugifyWorkspace(companyName);
    const jobTitle = toStringValue(formData.get("jobTitle"));
    const industry = toStringValue(formData.get("industry"));
    const teamSize = toStringValue(formData.get("companySize")) || toStringValue(formData.get("teamSize"));
    const monthlyHiringVolume = toStringValue(formData.get("monthlyHiringVolume"));
    const problemToSolve = toStringValue(formData.get("problemToSolve"));
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
      return NextResponse.json({ error: "Work email is required." }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let logoUrl: string | null = null;
    let logoPath: string | null = null;

    if (logoFile instanceof File && logoFile.size > 0) {
      if (!ALLOWED_LOGO_TYPES.has(logoFile.type)) {
        return NextResponse.json({ error: "Logo must be a PNG or JPG file." }, { status: 400 });
      }

      if (logoFile.size > MAX_LOGO_SIZE_BYTES) {
        return NextResponse.json({ error: "Logo must be 2MB or smaller." }, { status: 400 });
      }

      logoPath = `company-logos/${crypto.randomUUID()}`;
      const uploadBody = Buffer.from(await logoFile.arrayBuffer());

      const { error: uploadError } = await adminClient.storage.from("company-logos").upload(logoPath, uploadBody, {
        contentType: logoFile.type,
        upsert: false,
      });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: publicLogo } = adminClient.storage.from("company-logos").getPublicUrl(logoPath);
      logoUrl = publicLogo.publicUrl || logoPath;
    }

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

    const { error: companiesError } = await adminClient.from("companies").upsert({
      name: companyName,
      logo_url: logoUrl,
      plan,
      plan_expires_at: planExpiresAt,
    }, {
      onConflict: "name",
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
        first_name: deriveFirstName(firstName, adminFullName),
        last_name: deriveLastName(lastName, adminFullName),
        role: "hr_manager",
        tenant_id: tenantRow.id,
        company_name: companyName,
        tenant_name: companyName,
        plan,
        workspace_slug: workspaceSlug,
        job_title: jobTitle,
        industry,
        company_size: teamSize,
        monthly_hiring_volume: monthlyHiringVolume,
        problem_to_solve: problemToSolve,
      },
    });

    if (authError || !authUser.user) {
      // Log full error object and context to help debugging in dev
      console.error("[register/hr] auth.createUser failed", {
        authError,
        authUser,
        email,
        tenantId: tenantRow.id,
        workspaceSlug,
      });

      await removeTenantRow(adminClient, tenantRow.id, companyName);
      await deleteUpload(adminClient, logoPath);
      return NextResponse.json({ error: authError?.message || "Database error creating new user" }, { status: 500 });
    }

    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: authUser.user.id,
        email,
        first_name: deriveFirstName(firstName, adminFullName),
        last_name: deriveLastName(lastName, adminFullName),
        phone: toStringValue(formData.get("phone")),
        role: "hr_manager",
        tenant_name: companyName,
      },
      {
        onConflict: "id",
      }
    );

    if (profileError) {
      console.warn("[register/hr] profile upsert failed:", profileError.message);
    }

    return NextResponse.json(
      {
        success: true,
        firstName: deriveFirstName(firstName, adminFullName),
        lastName: deriveLastName(lastName, adminFullName),
        email,
        companyName,
        teamSize,
        workspaceSlug,
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