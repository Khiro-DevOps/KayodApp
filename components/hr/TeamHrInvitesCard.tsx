"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2, Trash2, UserPlus } from "lucide-react";
import {
  generateHrInviteAction,
  revokeHrInviteAction,
  type PendingTenantInvite,
} from "@/app/(hr)/hr/profile/invite-actions";

type TeamHrInvitesCardProps = {
  initialInvites: PendingTenantInvite[];
};

export default function TeamHrInvitesCard({ initialInvites }: TeamHrInvitesCardProps) {
  const [invites, setInvites] = useState<PendingTenantInvite[]>(initialInvites);
  const [emailInput, setEmailInput] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function buildFullInviteUrl(invitePath: string): string {
    if (typeof window === "undefined") {
      return invitePath;
    }
    return `${window.location.origin}${invitePath}`;
  }

  function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setGeneratedLink(null);
    setCopied(false);

    const targetEmail = emailInput.trim().toLowerCase();
    if (!targetEmail) {
      setError("Please enter a work email address.");
      return;
    }

    startTransition(async () => {
      const res = await generateHrInviteAction(targetEmail);
      if (!res.success || !res.invitePath || !res.invite) {
        setError(res.error || "Failed to generate invite link.");
        return;
      }

      const fullUrl = buildFullInviteUrl(res.invitePath);
      setGeneratedLink(fullUrl);
      setEmailInput("");
      setInvites((prev) => {
        const filtered = prev.filter((item) => item.id !== res.invite!.id);
        return [res.invite!, ...filtered];
      });
    });
  }

  async function handleCopy() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function handleRevoke(inviteId: string) {
    setError(null);
    setRevokingId(inviteId);
    startTransition(async () => {
      const res = await revokeHrInviteAction(inviteId);
      setRevokingId(null);
      if (!res.success) {
        setError(res.error || "Failed to revoke invite.");
        return;
      }
      setInvites((prev) => prev.filter((item) => item.id !== inviteId));
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card-bg p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Team &amp; HR Invites</h2>
            <p className="text-xs text-text-muted">
              Invite another HR Manager to your company workspace. Links expire in 7 days and are shown only once.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleGenerate} className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="email"
          required
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="colleague@company.com"
          className="flex-1 rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          {isPending && !revokingId ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              <span>Generate Invite Link</span>
            </>
          )}
        </button>
      </form>

      {generatedLink ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-xs font-semibold text-emerald-900">
            One-time invite link generated — copy and share it now:
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={generatedLink}
              className="flex-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Pending Invites ({invites.length})
        </p>
        {invites.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface-bg/60 px-3 py-4 text-center text-xs text-text-muted">
            No pending HR invites.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-surface-bg">
            {invites.map((inv) => {
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-text-main truncate">{inv.invited_email}</p>
                    <p className="text-[11px] text-text-muted">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={isPending && revokingId === inv.id}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Revoke</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
