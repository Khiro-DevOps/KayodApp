"use client";

import { useFormStatus } from "react-dom";

interface PayrollSubmitButtonProps {
  label: string;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function PayrollSubmitButton({
  label,
  pendingLabel = "Processing...",
  disabled = false,
  className = "",
}: PayrollSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
