"use client";

import Link from "next/link";

export default function FooterLanding() {
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-sm text-slate-600">© {new Date().getFullYear()} Kayod</div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">Log in</Link>
          <Link href="/register" className="text-sm text-slate-600 hover:text-slate-900">Register</Link>
          <span className="text-sm text-slate-400">Support</span>
        </div>
      </div>
    </footer>
  );
}
