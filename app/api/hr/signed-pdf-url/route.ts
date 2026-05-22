import { NextRequest, NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function extractDocusealSlug(value: string | null | undefined) {
  if (!value) return null;

  const match = value.match(/\/(?:embed\/)?s\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function readDocuments(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload[0]?.documents ?? [];
  }

  if (payload && typeof payload === "object") {
    const record = payload as {
      data?: Array<{ documents?: Array<{ url?: string | null }> }>;
      documents?: Array<{ url?: string | null }>;
    };

    if (Array.isArray(record.data)) {
      return record.data[0]?.documents ?? [];
    }

    return record.documents ?? [];
  }

  return [];
}

function extractPdfUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    audit_log_url?: string | null;
    combined_document_url?: string | null;
    documents?: Array<{ url?: string | null }>;
    data?: Array<{
      audit_log_url?: string | null;
      combined_document_url?: string | null;
      documents?: Array<{ url?: string | null }>;
    }>;
  };

  const directUrl =
    (typeof record.combined_document_url === "string" && record.combined_document_url.trim()) ||
    (typeof record.audit_log_url === "string" && record.audit_log_url.trim()) ||
    record.documents?.[0]?.url ||
    record.data?.[0]?.combined_document_url ||
    record.data?.[0]?.audit_log_url ||
    record.data?.[0]?.documents?.[0]?.url ||
    null;

  return directUrl;
}

export async function GET(request: NextRequest) {
  const offerId = request.nextUrl.searchParams.get("offerId");
  if (!offerId) {
    return NextResponse.json({ url: null });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ url: null }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: offer } = await admin
    .from("job_offers")
    .select(`
      id,
      application_id,
      latest_docuseal_url,
      job_metadata,
      applications!inner(
        id,
        contract_offer_id,
        job_postings!inner(created_by)
      )
    `)
    .eq("id", offerId)
    .maybeSingle();

  const application = (offer?.applications as { id?: string; contract_offer_id?: string | null; job_postings?: { created_by?: string | null } | null } | null) ?? null;
  const createdBy = application?.job_postings?.created_by;
  if (createdBy !== user.id) {
    return NextResponse.json({ url: null }, { status: 403 });
  }

  const signedDocument = application?.contract_offer_id
    ? await admin
        .from("signed_documents")
        .select("id, application_id, docuseal_submitter_id, docuseal_submission_url, latest_docuseal_url, pdf_file_path, metadata")
        .eq("id", application.contract_offer_id)
        .maybeSingle()
    : offer?.application_id
      ? await admin
          .from("signed_documents")
          .select("id, application_id, docuseal_submitter_id, docuseal_submission_url, latest_docuseal_url, pdf_file_path, metadata")
          .eq("application_id", offer.application_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null as null };

  const metadata = (signedDocument?.data?.metadata ?? offer?.job_metadata) as Record<string, unknown> | null;
  const storedPdfUrl =
    (typeof signedDocument?.data?.pdf_file_path === "string" && signedDocument.data.pdf_file_path.trim()) ||
    (typeof metadata?.signed_pdf_url === "string" && metadata.signed_pdf_url.trim()) ||
    (typeof metadata?.combined_document_url === "string" && metadata.combined_document_url.trim()) ||
    null;

  if (storedPdfUrl) {
    return NextResponse.json({ url: storedPdfUrl });
  }

  const sourceUrl =
    (signedDocument?.data?.docuseal_submission_url as string | null | undefined) ||
    (signedDocument?.data?.latest_docuseal_url as string | null | undefined) ||
    (typeof metadata?.docuseal_submission_url === "string" && metadata.docuseal_submission_url) ||
    (typeof metadata?.docuseal_embed_src === "string" && metadata.docuseal_embed_src) ||
    offer?.latest_docuseal_url ||
    null;

  const slug = extractDocusealSlug(sourceUrl);
  if (!slug) {
    return NextResponse.json({ url: null });
  }

  const apiUrl = process.env.DOCUSEAL_API_URL?.trim() || "https://api.docuseal.com";
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ url: null });
  }

  const signedDocumentId = signedDocument?.data?.id ?? null;
  const submitterId = signedDocument?.data?.docuseal_submitter_id ?? null;

  if (signedDocumentId) {
    const byExternalIdResponse = await fetch(`${apiUrl}/submitters?external_id=${encodeURIComponent(String(signedDocumentId))}`, {
      headers: {
        "X-Auth-Token": apiKey,
      },
      cache: "no-store",
    });

    if (byExternalIdResponse.ok) {
      const byExternalIdPayload = await byExternalIdResponse.json();
      const externalIdDocuments = readDocuments(byExternalIdPayload);
      const externalIdUrl = extractPdfUrl(byExternalIdPayload) ?? externalIdDocuments[0]?.url ?? null;
      if (externalIdUrl) {
        return NextResponse.json({ url: externalIdUrl });
      }
    }
  }

  if (submitterId) {
    const bySubmitterIdResponse = await fetch(`${apiUrl}/submitters/${encodeURIComponent(String(submitterId))}`, {
      headers: {
        "X-Auth-Token": apiKey,
      },
      cache: "no-store",
    });

    if (bySubmitterIdResponse.ok) {
      const bySubmitterIdPayload = await bySubmitterIdResponse.json();
      const submitterDocuments = readDocuments(bySubmitterIdPayload);
      const submitterUrl = extractPdfUrl(bySubmitterIdPayload) ?? submitterDocuments[0]?.url ?? null;
      if (submitterUrl) {
        return NextResponse.json({ url: submitterUrl });
      }
    }
  }

  const submissionResponse = await fetch(`${apiUrl}/submissions?slug=${encodeURIComponent(slug)}`, {
    headers: {
      "X-Auth-Token": apiKey,
    },
    cache: "no-store",
  });

  if (submissionResponse.ok) {
    const submissionPayload = await submissionResponse.json();
    const submissionUrl = extractPdfUrl(submissionPayload);
    if (submissionUrl) {
      return NextResponse.json({ url: submissionUrl });
    }

    const submissionList = Array.isArray(submissionPayload?.data)
      ? submissionPayload.data[0]
      : submissionPayload;
    const submissionId = submissionList && typeof submissionList === "object" ? (submissionList as { id?: number }).id : undefined;

    if (submissionId) {
      const documentsResponse = await fetch(`${apiUrl}/submissions/${submissionId}/documents?merge=true`, {
        headers: {
          "X-Auth-Token": apiKey,
        },
        cache: "no-store",
      });

      if (documentsResponse.ok) {
        const documentsPayload = await documentsResponse.json();
        const documents = readDocuments(documentsPayload);
        const url = documents[0]?.url ?? null;
        if (url) {
          return NextResponse.json({ url });
        }
      }
    }
  }

  const response = await fetch(`${apiUrl}/submitters?slug=${encodeURIComponent(slug)}`, {
    headers: {
      "X-Auth-Token": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ url: null });
  }

  const payload = await response.json();
  const documents = readDocuments(payload);
  const url = extractPdfUrl(payload) ?? documents[0]?.url ?? null;

  return NextResponse.json({ url });
}