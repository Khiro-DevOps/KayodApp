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
    .select("job_metadata, applications!inner(job_postings!inner(created_by))")
    .eq("id", offerId)
    .maybeSingle();

  const createdBy = (offer?.applications as { job_postings?: { created_by?: string | null } | null } | null)?.job_postings?.created_by;
  if (createdBy !== user.id) {
    return NextResponse.json({ url: null }, { status: 403 });
  }

  const metadata = offer?.job_metadata as Record<string, unknown> | null;
  const sourceUrl =
    (typeof metadata?.docuseal_submission_url === "string" && metadata.docuseal_submission_url) ||
    (typeof metadata?.docuseal_embed_src === "string" && metadata.docuseal_embed_src) ||
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
  const url = documents[0]?.url ?? null;

  return NextResponse.json({ url });
}