import { NextRequest, NextResponse } from "next/server";

import { getDocusealBaseUrl } from "@/lib/docuseal";
import {
  markOfferSigned,
  verifyDocusealSubmissionCompleted,
} from "@/lib/offer-lifecycle";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const HR_ROLES = new Set(["hr_manager", "admin", "hr"]);

function extractDocusealSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  if (match?.[1]) return match[1];
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? null;
  } catch {
    return null;
  }
}

async function verifyDocusealSubmitterBySlug(slug: string): Promise<{
  completed: boolean;
  submissionId: string | null;
}> {
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim() ?? "";
  if (!apiKey) return { completed: false, submissionId: null };

  try {
    const res = await fetch(
      `${getDocusealBaseUrl()}/submitters?slug=${encodeURIComponent(slug)}`,
      {
        headers: { "X-Auth-Token": apiKey },
        cache: "no-store",
      },
    );
    if (!res.ok) return { completed: false, submissionId: null };
    const payload = await res.json();
    const record = Array.isArray(payload)
      ? payload[0]
      : Array.isArray(payload?.data)
        ? payload.data[0]
        : payload;
    const status = typeof record?.status === "string" ? record.status.toLowerCase() : "";
    const submissionId = record?.submission_id != null ? String(record.submission_id) : null;
    let completed = status === "completed" || Boolean(record?.completed_at);
    if (!completed && submissionId) {
      completed = await verifyDocusealSubmissionCompleted(submissionId);
    }
    return { completed, submissionId };
  } catch {
    return { completed: false, submissionId: null };
  }
}

export async function POST(req: NextRequest, ctx: unknown) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const rawParams = (ctx as { params?: unknown })?.params;
    const params =
      rawParams && typeof (rawParams as Promise<unknown>).then === "function"
        ? await (rawParams as Promise<Record<string, string | undefined>>)
        : ((rawParams as Record<string, string | undefined> | undefined) ?? {});
    const jobOfferId = params?.jobOfferId;

    if (!jobOfferId) {
      return NextResponse.json({ error: "Missing jobOfferId" }, { status: 400 });
    }

    const { data: offer, error: offerError } = await admin
      .from("job_offers")
      .select("id, application_id, status, docuseal_submission_id, latest_docuseal_url, job_metadata, metadata")
      .eq("id", jobOfferId)
      .maybeSingle();

    if (offerError) {
      return NextResponse.json({ error: offerError.message }, { status: 500 });
    }

    if (!offer) {
      return NextResponse.json({ error: "Job offer not found" }, { status: 404 });
    }

    const [{ data: profile }, { data: application }] = await Promise.all([
      admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      offer.application_id
        ? admin
            .from("job_applications")
            .select("id, applicant_id")
            .eq("id", offer.application_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const isHr = HR_ROLES.has(String(profile?.role ?? ""));
    const isApplicant = Boolean(application?.applicant_id && application.applicant_id === user.id);

    if (!isHr && !isApplicant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedStatus = String(offer.status ?? "").toUpperCase();
    if (["SIGNED", "HIRED", "HIRE_CONFIRMED"].includes(normalizedStatus)) {
      return NextResponse.json({ success: true, alreadySigned: true });
    }

    const body = (await req.json().catch(() => null)) as {
      submissionId?: string | number | null;
      slug?: string | null;
      docusealData?: {
        submission_id?: string | number | null;
        submission?: { id?: string | number | null } | null;
        slug?: string | null;
        status?: string | null;
        completed_at?: string | null;
      } | null;
    } | null;
    const docusealData = body?.docusealData ?? null;
    const offerMeta = ((offer.job_metadata ?? offer.metadata) || {}) as Record<string, unknown>;

    let submissionId: string | null =
      offer.docuseal_submission_id ??
      (offerMeta.docuseal_submission_id != null ? String(offerMeta.docuseal_submission_id) : null) ??
      (body?.submissionId != null ? String(body.submissionId) : null) ??
      (docusealData?.submission_id != null ? String(docusealData.submission_id) : null) ??
      (docusealData?.submission?.id != null ? String(docusealData.submission.id) : null);

    let signedDocUrl: string | null = null;
    if (!submissionId && offer.application_id) {
      const { data: signedDoc } = await admin
        .from("signed_documents")
        .select("docuseal_submission_url, metadata")
        .eq("application_id", offer.application_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      signedDocUrl = signedDoc?.docuseal_submission_url ?? null;
      const metaSubId = (signedDoc?.metadata as Record<string, unknown> | null)?.docuseal_submission_id;
      submissionId = metaSubId != null ? String(metaSubId) : null;
    }

    let completed = await verifyDocusealSubmissionCompleted(submissionId);
    if (!completed) {
      const slug =
        (typeof body?.slug === "string" && body.slug.trim()) ||
        (typeof docusealData?.slug === "string" && docusealData.slug.trim()) ||
        extractDocusealSlug(offer.latest_docuseal_url) ||
        extractDocusealSlug(signedDocUrl);
      if (slug) {
        const bySlug = await verifyDocusealSubmitterBySlug(slug);
        completed = bySlug.completed;
        if (!submissionId && bySlug.submissionId) {
          submissionId = bySlug.submissionId;
        }
      }
    }

    if (!completed && submissionId) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      completed = await verifyDocusealSubmissionCompleted(submissionId);
    }

    if (!completed) {
      return NextResponse.json(
        { error: "Signing not completed yet" },
        { status: 409 },
      );
    }

    const result = await markOfferSigned({
      applicationId: offer.application_id,
      offerId: offer.id,
      source: "sign_route",
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, changed: result.changed });
  } catch (error) {
    console.error("[Job Offer Sign] Failed to update signing status:", error);
    return NextResponse.json({ error: "Failed to update signing status" }, { status: 500 });
  }
}