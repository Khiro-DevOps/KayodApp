import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getResumeBucketName } from "@/lib/supabase/storage";

export async function DELETE(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify candidate role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "candidate") {
    return NextResponse.json(
      { error: "Only candidates can delete resumes" },
      { status: 403 }
    );
  }

  let body: { resume_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { resume_id } = body;

  if (!resume_id) {
    return NextResponse.json(
      { error: "resume_id is required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const { data: resume } = await supabase
    .from("resumes")
    .select("id, file_path")
    .eq("id", resume_id)
    .eq("candidate_id", user.id)
    .single();

  if (!resume) {
    return NextResponse.json(
      { error: "Resume not found or unauthorized" },
      { status: 404 }
    );
  }

  try {
    // Delete resume versions first (foreign key constraint)
    const { error: versionsError } = await supabase
      .from("resume_versions")
      .delete()
      .eq("resume_id", resume_id);

    if (versionsError) {
      return NextResponse.json(
        { error: `Failed to delete resume versions: ${versionsError.message}` },
        { status: 500 }
      );
    }

    // Delete the resume record
    const { error: dbError } = await supabase
      .from("resumes")
      .delete()
      .eq("id", resume_id);

    if (dbError) {
      return NextResponse.json(
        { error: `Failed to delete resume: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Delete file from storage if it exists
    if (resume.file_path) {
      const admin = await getAdminClient();
      const bucketName = getResumeBucketName();
      
      await admin.storage.from(bucketName).remove([resume.file_path]);
    }

    return NextResponse.json(
      { message: "Resume deleted successfully" },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete resume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
