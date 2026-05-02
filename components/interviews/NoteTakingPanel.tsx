"use client";

import { FC, useEffect, useRef } from "react";

interface NoteTakingPanelProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  applicantName?: string;
}

const NoteTakingPanel: FC<NoteTakingPanelProps> = ({
  notes,
  onNotesChange,
  onClose,
  applicantName = "Applicant",
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus textarea when panel opens
    textAreaRef.current?.focus();
  }, []);

  return (
    <>
      {/* Note-Taking Panel (right side, 25vw width) - rendered as a sibling in a flex container */}
      <div className="z-30 w-96 bg-white/95 backdrop-blur-sm shadow-2xl flex flex-col animate-in slide-in-from-right-96">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
          <h3 className="font-bold text-lg text-gray-900">
            Interview Notes: {applicantName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors text-2xl leading-none"
            title="Close notes"
          >
            ✕
          </button>
        </div>

        {/* Markdown Info */}
        <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-700 font-medium">
            💡 Supports Markdown: **bold**, *italic*, - bullets, 1. numbered
          </p>
        </div>

        {/* Textarea */}
        <textarea
          ref={textAreaRef}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={`Add real-time notes about ${applicantName}'s interview...

## Example Sections:
- **Technical Skills:**
- **Communication:**
- **Cultural Fit:**
- **Follow-up Items:**`}
          className="flex-1 px-6 py-4 border-0 resize-none focus:outline-none text-sm text-gray-800 placeholder-gray-400 font-mono"
        />

        {/* Footer Stats */}
        <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 flex justify-between items-center text-xs text-gray-600">
          <span>{notes.length} characters</span>
          <span>{notes.split("\n").length} lines</span>
        </div>
      </div>
    </>
  );
};

export default NoteTakingPanel;
