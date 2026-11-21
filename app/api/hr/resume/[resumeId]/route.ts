import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { effectiveRole, isHRRole } from "@/lib/roles";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ resumeId: string }> },
) {
  try {
    const { resumeId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();

    const rawMeta = (
      (user as { raw_user_meta_data?: Record<string, unknown> }).raw_user_meta_data ?? {}
    ) as Record<string, unknown>;
    const authRole = (user.user_metadata?.role ?? rawMeta.role) as string | undefined;
    const role = effectiveRole(profile?.role, authRole);

    if (!isHRRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: resume, error } = await admin
      .from("resumes")
      .select(
        "id, title, pdf_url, content_text, generated_content, input_data, created_at, updated_at",
      )
      .eq("id", resumeId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!resume) {
      return NextResponse.json({ error: "Resume record not found." }, { status: 404 });
    }

    let signedPdfUrl: string | null = null;
    if (resume.pdf_url) {
      const match = resume.pdf_url.match(/\/resumes\/(.+)$/);
      const rawPath = match ? match[1] : null;
      if (rawPath) {
        const cleanPath = decodeURIComponent(rawPath.split("?")[0]);
        const storagePath = cleanPath.startsWith("/") ? cleanPath.substring(1) : cleanPath;
        const { data: signed } = await admin.storage
          .from("resumes")
          .createSignedUrl(storagePath, 3600);
        if (signed?.signedUrl) {
          signedPdfUrl = signed.signedUrl;
        }
      }
    }

    return NextResponse.json({ resume, signedPdfUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load resume" },
      { status: 500 },
    );
  }
}
