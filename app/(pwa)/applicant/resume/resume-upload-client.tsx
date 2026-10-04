"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ResumeUploadClient() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFileName(e.target.files?.[0]?.name ?? "");
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !fileInputRef.current) return;

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInputRef.current.files = transfer.files;
    setSelectedFileName(file.name);
  }

  return (
    <div className="rounded-xl bg-card-bg border border-border p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">Upload Resume</h2>
        <p className="mt-1 text-sm text-text-secondary">Add an existing resume to your account.</p>
      </div>
      <form onSubmit={handleUpload} className="space-y-3">
        <label
          htmlFor="resume-upload"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-bg px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary-light/30"
        >
          <span className="material-symbols-outlined text-3xl text-primary">upload_file</span>
          <span className="mt-2 text-sm font-medium text-text-primary">Drag and drop your file here</span>
          <span className="mt-1 text-xs text-text-secondary">PDF, DOC, DOCX, or TXT (max 5MB)</span>
          <span className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white">Browse Files</span>
          <input
            id="resume-upload"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>

        {selectedFileName && <p className="truncate text-xs text-text-secondary">Selected: {selectedFileName}</p>}

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