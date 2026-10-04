"use client";

export default function GenerateResumeTrigger({ onClick }: { onClick?: () => void }) {
  const triggerGeneration = () => {
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={triggerGeneration}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
    >
      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
      Build my resume
    </button>
  );
}
