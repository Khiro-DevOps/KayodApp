"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ResumeUploadClient() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-resume", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }

      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">Upload Resume</h2>
      <form onSubmit={handleUpload} className="space-y-3">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
          />
          <p className="mt-1 text-xs text-text-secondary">
            PDF, DOC, DOCX, or TXT (max 5MB)
          </p>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {success && (
          <p className="text-xs text-green-600">
            ✅ Resume uploaded successfully!
          </p>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>
    </div>
  );
}