// supabase/functions/compute-payroll/index.ts
// Deploy: supabase functions deploy compute-payroll
// Invoke: POST /functions/v1/compute-payroll  (HR/admin only, validated via JWT)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate caller is HR or admin
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt!);
    if (authErr || !user) return new Response("Unauthorized", { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["hr", "admin"].includes(profile?.role)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Parse body: { company_id, period_start, period_end }
    const { company_id, period_start, period_end } = await req.json();
    if (!company_id || !period_start || !period_end) {
      return new Response("Missing fields", { status: 400 });
    }

    // Fetch all active employees for this company
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, hourly_rate")
      .eq("company_id", company_id)
      .eq("is_active", true);

    if (empErr) throw empErr;

    const stubs = [];

    for (const emp of employees ?? []) {
      // Sum total_hours for this employee in the pay period
      const { data: logs, error: logErr } = await supabase
        .from("time_logs")
        .select("total_hours")
        .eq("employee_id", emp.id)
        .eq("punch_type", "out")
        .gte("punched_at", `${period_start}T00:00:00Z`)
        .lte("punched_at", `${period_end}T23:59:59Z`);

      if (logErr) throw logErr;

      const total_hours = logs?.reduce((sum, l) => sum + (l.total_hours ?? 0), 0) ?? 0;
      if (total_hours === 0) continue; // skip employees with no hours

      // Upsert pay stub (idempotent re-runs)
      const { error: stubErr } = await supabase
        .from("pay_stubs")
        .upsert(
          {
            employee_id:  emp.id,
            company_id,
            period_start,
            period_end,
            total_hours,
            hourly_rate:  emp.hourly_rate,
            deductions:   0,
          },
          { onConflict: "employee_id,period_start,period_end" }
        );

      if (stubErr) throw stubErr;
      stubs.push({ employee_id: emp.id, total_hours });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: stubs.length, stubs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});