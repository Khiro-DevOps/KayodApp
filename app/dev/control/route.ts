import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getStatusesForStage, UI_STAGES } from "@/lib/application-stages";
import { devRouteGuard } from "@/lib/dev-guard";
import { createClient } from "@/lib/supabase/server";

const STAGES = UI_STAGES.flatMap((s) => getStatusesForStage(s.key));

type Stage = string;

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
  const guard = await devRouteGuard();
  if (guard) return guard;

  if (process.env.NODE_ENV === "production") {
    return jsonError(
      "Developer control endpoints are only available in development mode.",
      404
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Authentication required.", 401);
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

  const { data: existingApp, error: existingError } = await admin
    .from("job_applications")
    .select("id, status, applicant_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (existingError) {
    return jsonError(existingError.message, 500);
  }

  if (!existingApp) {
    return jsonError(
      `No application was found with ID ${applicationId}.`,
      404
    );
  }

  const wasHired = String(existingApp.status ?? "").toLowerCase() === "hired";
  const isPreHireStage = String(stage).toLowerCase() !== "hired";
  const updatePayload: {
    status: Stage;
    contract_offer_id?: null;
    updated_at?: string;
  } = {
    status: stage,
  };

  if (wasHired && isPreHireStage) {
    updatePayload.contract_offer_id = null;
    updatePayload.updated_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("job_applications")
    .update(updatePayload)
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

  if (wasHired && isPreHireStage && existingApp.applicant_id) {
    await admin
      .from("profiles")
      .update({
        role: "applicant",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingApp.applicant_id)
      .eq("role", "employee");
  }

  return jsonSuccess(
    `Application stage updated to ${stage}.`,
    {
      application: data,
    }
  );
}