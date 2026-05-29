import { NextResponse } from "next/server";
import { submitApplicantDocument } from "@/lib/pre-employment-actions";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
    const maxBytes = 10 * 1024 * 1024;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ success: false, error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > maxBytes) {
      return NextResponse.json({ success: false, error: "File too large" }, { status: 400 });
    }

    const result = await submitApplicantDocument(formData as FormData);

    if (result?.success) {
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: result?.error ?? "Upload failed" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
