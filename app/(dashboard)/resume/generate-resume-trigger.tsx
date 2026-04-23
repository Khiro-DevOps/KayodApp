"use client";

export default function GenerateResumeTrigger() {
  const triggerGeneration = () => {
    window.dispatchEvent(new CustomEvent("resume:generate-request"));
  };

  return (
    <button
      type="button"
      onClick={triggerGeneration}
      className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
    >
      Your Resume
    </button>
  );
}
