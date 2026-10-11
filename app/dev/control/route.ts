import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const STAGES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
] as const;

type Stage = (typeof STAGES)[number];

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}

function jsonSuccess(
  message: string,
  data: Record<string, unknown> = {}
) {
  return NextResponse.json({
    success: true,
    message,
    ...data,
  });
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return jsonError(
      "Developer control endpoints are only available in development mode.",
      404
    );
  }

  const admin = getAdminClient();

  if (!admin) {
    return jsonError(
      "Supabase admin configuration is missing.",
      500
    );
  }

  let body: {
    action?: string;
    applicationId?: string;
    stage?: Stage;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must contain valid JSON.");
  }

  if (body.action !== "update_stage") {
    return jsonError(
      "This endpoint only supports the update_stage action."
    );
  }

  const applicationId = body.applicationId?.trim();
  const stage = body.stage;

  if (!applicationId) {
    return jsonError("applicationId is required.");
  }

  if (!stage || !STAGES.includes(stage)) {
    return jsonError(
      `Invalid stage. Allowed stages: ${STAGES.join(", ")}.`
    );
  }

  const { data, error } = await admin
    .from("job_applications")
    .update({
      status: stage,
    })
    .eq("id", applicationId)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return jsonError(error.message, 500);
  }

  if (!data) {
    return jsonError(
      `No application was found with ID ${applicationId}.`,
      404
    );
  }

  return jsonSuccess(
    `Application stage updated to ${stage}.`,
    {
      application: data,
    }
  );
}