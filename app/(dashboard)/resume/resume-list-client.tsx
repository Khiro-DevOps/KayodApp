"use client";

import { useState } from "react";
import { Resume } from "@/lib/types";
import ResumeCard from "./resume-card";
import ResumePreviewModal from "./resume-preview-modal";

interface ResumeListClientProps {
  resumes: Resume[];
}

export default function ResumeListClient({ resumes }: ResumeListClientProps) {
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);

  return (
    <>
      {!resumes || resumes.length === 0 ? (
        <p className="text-xs text-text-secondary">No resumes yet</p>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {resumes.map((resume) => (
            <ResumeCard
              key={resume.id}
              resume={resume}
              isSelected={selectedResume?.id === resume.id}
              onSelect={setSelectedResume}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <ResumePreviewModal
        resume={selectedResume}
        onClose={() => setSelectedResume(null)}
      />
    </>
  );
}
