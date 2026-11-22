"use server";

import { getAdminClient } from "@/lib/supabase/admin";

const COMPANY_LOGO_BUCKET = "company-logos";
const COMPANY_LOGO_PLACEHOLDER_PATH = "/company-logo-placeholder.svg";

function getAppBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "http://localhost:3000";
  return configuredUrl.replace(/\/$/, "");
}

export async function getCompanyLogoFallbackUrl() {
  return `${getAppBaseUrl()}${COMPANY_LOGO_PLACEHOLDER_PATH}`;
}

function normalizeCompanyLogoPath(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
  const publicPathPrefix = `storage/v1/object/public/${COMPANY_LOGO_BUCKET}/`;

  if (withoutLeadingSlash.startsWith(publicPathPrefix)) {
    return decodeURIComponent(withoutLeadingSlash.slice(publicPathPrefix.length));
  }

  const bucketPrefix = `${COMPANY_LOGO_BUCKET}/`;
  if (withoutLeadingSlash.startsWith(bucketPrefix)) {
    return decodeURIComponent(withoutLeadingSlash.slice(bucketPrefix.length));
  }

  return decodeURIComponent(withoutLeadingSlash);
}

export async function resolveCompanyLogoUrlForUser(userId: string) {
  const admin = getAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle<{ tenant_id?: string | null }>();

  if (profileError) {
    console.warn("[company-logos] Failed to load profile tenant:", profileError.message);
    return getCompanyLogoFallbackUrl();
  }

  const tenantId = profile?.tenant_id?.trim();
  if (!tenantId) {
    return getCompanyLogoFallbackUrl();
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("logo_url")
    .eq("id", tenantId)
    .maybeSingle<{ logo_url?: string | null }>();

  if (tenantError) {
    console.warn("[company-logos] Failed to load company logo:", tenantError.message);
    return getCompanyLogoFallbackUrl();
  }

  const resolvedLogo = typeof tenant?.logo_url === "string" ? normalizeCompanyLogoPath(tenant.logo_url) : null;
  if (!resolvedLogo) {
    return getCompanyLogoFallbackUrl();
  }

  if (/^https?:\/\//i.test(resolvedLogo)) {
    return resolvedLogo;
  }

  const { data: publicLogo } = admin.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(resolvedLogo);
  return publicLogo.publicUrl || getCompanyLogoFallbackUrl();
}