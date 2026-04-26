"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Resume } from "@/lib/types";
import { deleteResume } from "./delete-resume";
import { createClient } from "@/lib/supabase/client";

interface ResumeCardProps {
  resume: Resume;
  isSelected?: boolean;
  onSelect: (resume: Resume) => void;
}

export default function ResumeCard({
  resume,
  isSelected = false,
  onSelect,
}: ResumeCardProps) {
  const router = useRouter();
  const supabase = createClient();

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(resume.title || "");
  const [deleting, setDeleting] = useState(false);

  async function handleRename() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === resume.title) {
      setIsEditing(false);
      setTitle(resume.title || "");
      return;
    }
    const { error } = await supabase
      .from("resumes")
      .update({ title: trimmed })
      .eq("id", resume.id);

    if (!error) {
      setIsEditing(false);
      router.refresh();
    } else {
      console.error("Rename failed:", error.message);
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 transition-all duration-200 ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-surface hover:border-primary/30 hover:shadow-sm"
      }`}
    >
      {/* TITLE ROW */}
      <div
        className="flex items-center justify-between gap-2 px-3 pt-3 cursor-pointer"
        onClick={() => !isEditing && onSelect(resume)}
      >
        {isEditing ? (
          <div
            className="flex-1 flex gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setTitle(resume.title || "");
                  setIsEditing(false);
                }
              }}
              onBlur={handleRename}
            />
          </div>
        ) : (
          <p className="flex-1 truncate text-sm font-medium text-text-primary">
            {resume.title || "Untitled Resume"}
          </p>
        )}

        {!isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="shrink-0 text-xs text-primary hover:underline"
          >
            Rename
          </button>
        )}
      </div>

      {/* META ROW */}
      <div
        className="flex items-center justify-between px-3 pb-1 pt-1 cursor-pointer"
        onClick={() => !isEditing && onSelect(resume)}
      >
        <p className="text-xs text-text-secondary">
          {new Date(resume.created_at).toLocaleDateString("en-PH", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        {resume.is_primary && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Primary
          </span>
        )}
      </div>

      {/* ACTION ROW */}
      <div
        className="flex items-center gap-2 border-t border-border px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Preview */}
        <button
          onClick={() => onSelect(resume)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
            <path fillRule="evenodd" d="M1.38 8a6.97 6.97 0 0 1 1.007-2.041 7.003 7.003 0 0 1 11.226 0A6.97 6.97 0 0 1 14.62 8a6.97 6.97 0 0 1-1.007 2.041 7.003 7.003 0 0 1-11.226 0A6.97 6.97 0 0 1 1.38 8ZM8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" clipRule="evenodd" />
          </svg>
          Preview
        </button>

        {/* Delete */}
        <form
          action={async (formData) => {
            try {
              setDeleting(true);
              await deleteResume(formData);
            } catch (err) {
              console.error("Delete failed:", err);
            } finally {
              setDeleting(false);
            }
          }}
        >
          <input type="hidden" name="resume_id" value={resume.id} />
          <button
            type="submit"
            disabled={deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-danger hover:bg-red-100 transition-colors disabled:opacity-50"
            title="Delete"
          >
            {deleting ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}