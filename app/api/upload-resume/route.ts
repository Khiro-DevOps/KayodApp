import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed." },
      { status: 400 }
    );
  }

  // Limit file size to 5MB
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB." },
      { status: 400 }
    );
  }

  // Generate a unique file path
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${user.id}/${Date.now()}_${sanitizedName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Get the public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from("resumes").getPublicUrl(filePath);

  // Extract text for plain text files
  let extractedText: string | null = null;
  if (file.type === "text/plain") {
    extractedText = await file.text();
  }

  // Store resume record in database
  const { data: resume, error: dbError } = await supabase
    .from("resumes")
    .insert({
      candidate_id: user.id,
      title: file.name,
      input_data: {
        source: "upload",
        file_name: file.name,
      },
      generated_content: {
        upload: true,
      },
      content_text: extractedText,
      pdf_url: publicUrl,
    })
    .select()
    .single();

  if (dbError) {
    // Clean up uploaded file if DB insert fails
    await supabase.storage.from("resumes").remove([filePath]);
    return NextResponse.json(
      { error: `Failed to save resume: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ resume }, { status: 201 });
}
