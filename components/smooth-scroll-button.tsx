"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type SmoothScrollButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  targetId: string;
  offset?: number;
  children: ReactNode;
};

export function SmoothScrollButton({ targetId, offset = 40, children, onClick, ...props }: SmoothScrollButtonProps) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const target = document.getElementById(targetId);
        if (!target) {
          return;
        }

        const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;
        window.scrollTo({ top: targetTop, behavior: "smooth" });
        window.history.pushState(null, "", `#${targetId}`);
      }}
    >
      {children}
    </button>
  );
}