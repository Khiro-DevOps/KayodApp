import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 })
  }

  const { applicationId, stage } = await req.json()
  const admin = getAdminClient()

  const STAGE_RESETS: Record<
    string,
    {
      applicationStatus: string
      jobOfferStatus?: string
      profileRole?: string
      clearJobOffer?: boolean
    }
  > = {
    submitted: {
      applicationStatus: "submitted",
      clearJobOffer: true,
    },
    under_review: {
      applicationStatus: "under_review",
      clearJobOffer: true,
    },
    interview_scheduled: {
      applicationStatus: "interview_scheduled",
      clearJobOffer: true,
    },
    interviewed: {
      applicationStatus: "interviewed",
      clearJobOffer: true,
    },
    negotiating: {
      applicationStatus: "negotiating",
      clearJobOffer: true,
    },
    offer_sent: {
      applicationStatus: "offer_sent",
      jobOfferStatus: "SENT",
    },
    offer_signed: {
      applicationStatus: "hired",
      jobOfferStatus: "SIGNED",
    },
    hire_confirmed: {
      applicationStatus: "hire_confirmed",
      jobOfferStatus: "HIRED",
      profileRole: "employee",
    },
  }

  const reset = STAGE_RESETS[stage]
  if (!reset) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 })
  }

  const now = new Date().toISOString()

  // 1. Update application status
  const { data: app, error: appError } = await admin
    .from("applications")
    .update({ status: reset.applicationStatus, updated_at: now })
    .eq("id", applicationId)
    .select("candidate_id")
    .single()

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 })
  }

  // 2. Update or clear job_offer
  if (reset.clearJobOffer) {
    // Set job offer back to DRAFT and clear docuseal URL
    await admin
      .from("job_offers")
      .update({
        status: "DRAFT",
        latest_docuseal_url: null,
        job_metadata: {},
        updated_at: now,
      })
      .eq("application_id", applicationId)
  } else if (reset.jobOfferStatus) {
    await admin
      .from("job_offers")
      .update({
        status: reset.jobOfferStatus,
        updated_at: now,
      })
      .eq("application_id", applicationId)
  }

  // 3. Reset profile role if needed
  if (app?.candidate_id) {
    if (reset.profileRole === "employee") {
      await admin
        .from("profiles")
        .update({ role: "employee", updated_at: now })
        .eq("id", app.candidate_id)
    } else {
      // Reset back to candidate
      await admin
        .from("profiles")
        .update({ role: "candidate", updated_at: now })
        .eq("id", app.candidate_id)
    }
  }

  // 4. Clear any hire_confirmed notifications for clean re-testing
  if (stage !== "hire_confirmed") {
    await admin
      .from("notifications")
      .delete()
      .eq("recipient_id", app?.candidate_id ?? "")
      .eq("type", "hire_confirmed")
  }

  return NextResponse.json({
    success: true,
    message: `Reset application ${applicationId} to stage: ${stage}`,
    applicationStatus: reset.applicationStatus,
    jobOfferStatus: reset.jobOfferStatus ?? null,
  })
}
