import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription-tiers";
import { acceptHrInviteAtomic, registerHrWorkspaceAtomic } from "@/app/(auth)/register/hr/actions";

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
  return lastName || adminFullName.split(/\s+/).slice(1).join(" ") || "HR";
}

async function deleteUpload(adminClient: ReturnType<typeof getAdminClient>, path: string | null) {
  if (!path) {
    return;
  }

  await adminClient.storage.from("company-logos").remove([path]);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const inviteToken = toStringValue(formData.get("inviteToken")) || toStringValue(formData.get("invite"));
    const firstName = toStringValue(formData.get("firstName")) || toStringValue(formData.get("first_name"));
    const lastName = toStringValue(formData.get("lastName")) || toStringValue(formData.get("last_name"));
    const adminFullName =
      toStringValue(formData.get("adminFullName")) ||
      [firstName, lastName].filter(Boolean).join(" ").trim();
    const resolvedFirstName = deriveFirstName(firstName, adminFullName);
    const resolvedLastName = deriveLastName(lastName, adminFullName);
    const companyName = toStringValue(formData.get("companyName")) || toStringValue(formData.get("tenant_name"));
    const email = toStringValue(formData.get("workEmail")) || toStringValue(formData.get("email"));
    const password = toStringValue(formData.get("password"));
    const confirmPassword = toStringValue(formData.get("confirmPassword"));
    const workspaceSlug = toStringValue(formData.get("workspaceSlug")) || slugifyWorkspace(companyName);
    const industry = toStringValue(formData.get("industry"));
    const teamSize =
      toStringValue(formData.get("companySize")) ||
      toStringValue(formData.get("company_size")) ||
      toStringValue(formData.get("teamSize"));
    const phone = toStringValue(formData.get("phone"));
    const address = toStringValue(formData.get("address")) || toStringValue(formData.get("headquartersLocation"));
    const city = toStringValue(formData.get("city"));
    const country = toStringValue(formData.get("country"));
    const rawPlan = toStringValue(formData.get("plan"));
    const plan: SubscriptionPlan = isSubscriptionPlan(rawPlan) ? rawPlan : "starter";
    const logoFile = formData.get("logoFile");

    if (!adminFullName && (!resolvedFirstName || !resolvedLastName)) {
      return NextResponse.json({ error: "HR full name is required." }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    if (inviteToken) {
      const inviteResult = await acceptHrInviteAtomic({
        inviteToken,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        phone,
        password,
      });

      if (!inviteResult.success) {
        return NextResponse.json(
          { error: inviteResult.error || "This invite link has expired. Ask your HR Manager for a new link." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          firstName: inviteResult.firstName,
          lastName: inviteResult.lastName,
          email: inviteResult.email,
          companyName: inviteResult.tenantName,
          tenantId: inviteResult.tenantId,
        },
        { status: 201 }
      );
    }

    if (!companyName) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Work email is required." }, { status: 400 });
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

    const resolvedTenantAddress = [address, city, country].filter(Boolean).join(", ") || address || null;

    const result = await registerHrWorkspaceAtomic({
      companyName,
      industry,
      companySize: teamSize,
      address: resolvedTenantAddress,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      phone,
      email,
      password,
      plan,
      logoUrl,
    });

    if (!result.success) {
      await deleteUpload(adminClient, logoPath);
      return NextResponse.json(
        { error: result.error || "Failed to create the HR workspace." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        companyName: result.tenantName,
        teamSize,
        workspaceSlug,
        plan,
        planExpiresAt,
        logoUrl,
        tenantId: result.tenantId,
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