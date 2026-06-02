"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const STAGES = [
  { value: "submitted", label: "1 — New (submitted)" },
  { value: "under_review", label: "2 — Screening (under review)" },
  { value: "interview_scheduled", label: "3 — Interview scheduled" },
  { value: "interviewed", label: "4 — Interviewed" },
  { value: "negotiating", label: "5 — Negotiating" },
  { value: "offer_sent", label: "6 — Offer sent (awaiting signature)" },
  { value: "offer_signed", label: "7 — Offer signed (awaiting HR confirmation)" },
  { value: "hire_confirmed", label: "8 — Hire confirmed (employee)" },
]

export default function ResetForm() {
  const router = useRouter()
  const [applicationId, setApplicationId] = useState("bfe45863-3fc7-40f7-9917-041e4d53b276")
  const [stage, setStage] = useState("offer_sent")
  const [loading, setLoading] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/dev/reset-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, stage }),
      })
      const data = await res.json() as { message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Reset failed")
      setResult(data.message ?? "Reset successful")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed")
    } finally {
      setLoading(false)
    }
  }

  async function handlePromoteToEmployee() {
    setPromoting(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/dev/promote-to-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      })
      const data = await res.json() as { message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Promotion failed")
      setResult(data.message ?? "Successfully converted applicant to full employee")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promotion failed")
    } finally {
      setPromoting(false)
    }
  }

  const isBtnDisabled = loading || promoting || !applicationId

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "40px auto",
        padding: 24,
        background: "#fff",
        border: "1px solid #e8e8e4",
        borderRadius: 16,
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          🛠 Dev: Application Control Matrix
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
          Only visible in development mode
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
          Target Application ID
        </label>
        <input
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e8e8e4",
            fontSize: 13,
            fontFamily: "monospace",
          }}
          placeholder="paste application UUID"
        />
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #e8e8e4", margin: "20px 0" }} />

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px 0", color: "#111" }}>
          Option A: Modify Status Stage
        </h3>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e8e8e4",
            fontSize: 13,
          }}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => void handleReset()}
          disabled={isBtnDisabled}
          style={{
            width: "100%",
            padding: "10px 0",
            background: loading ? "#e8e8e4" : "#4648d4",
            color: loading ? "#aaa" : "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: isBtnDisabled ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Updating Stage..." : "Apply Selected Stage"}
        </button>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #e8e8e4", margin: "20px 0" }} />

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 4px 0", color: "#111" }}>
          Option B: Complete Onboarding Forcefully
        </h3>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px 0", lineHeight: "16px" }}>
          Bypasses interview pipelines, signs contracts, creates an active record in the employee tables, and sets up dashboard metrics.
        </p>
        <button
          onClick={() => void handlePromoteToEmployee()}
          disabled={isBtnDisabled}
          style={{
            width: "100%",
            padding: "12px 0",
            background: promoting ? "#e8e8e4" : "#10b981",
            color: promoting ? "#aaa" : "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: isBtnDisabled ? "not-allowed" : "pointer",
          }}
        >
          {promoting ? "Converting Team Member..." : "⚡ Force Transition to Active Employee"}
        </button>
      </div>

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            fontSize: 13,
            color: "#15803d",
          }}
        >
          ✓ {result}
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            fontSize: 13,
            color: "#dc2626",
          }}
        >
          ✗ {error}
        </div>
      )}
    </div>
  )
}