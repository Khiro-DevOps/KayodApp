"use client";

import { useState, useRef } from "react";
import { MessageCircle, X } from "lucide-react";

interface AnnotationBubbleProps {
  interviewId: string;
  onNoteSave: (note: string) => Promise<void>;
  initialNote?: string;
}

export function AnnotationBubble({
  interviewId,
  onNoteSave,
  initialNote = "",
}: AnnotationBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onNoteSave(note);
      // Auto-close after save
      setTimeout(() => setIsOpen(false), 500);
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 rounded-full shadow-lg hover:shadow-xl transition-all z-40 ${
          isOpen ? "hidden" : "flex"
        } items-center justify-center w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white`}
        title="Add annotation"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Annotation Panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-lg shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-gray-800">Interview Notes</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded transition"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add notes about the candidate..."
            className="flex-1 p-4 resize-none focus:outline-none text-sm text-gray-700 min-h-[200px]"
          />

          {/* Footer */}
          <div className="p-4 border-t flex gap-2 justify-end">
            <button
              onClick={() => {
                setIsOpen(false);
                setNote(initialNote);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || note === initialNote}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-300 transition"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
