import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized in production" }, { status: 403 })
  }

  try {
    const { applicationId } = await req.json() as { applicationId: string }

    if (!applicationId) {
      return NextResponse.json({ error: "Missing application ID" }, { status: 400 })
    }

    const admin = getAdminClient()

    // 1. Fetch application details (including candidate info and job details)
    const { data: application, error: appFetchError } = await admin
      .from("applications")
      .select(`
        id,
        candidate_id,
        job_posting_id,
        job:job_postings(title, salary_min, employment_type, tenant_id, work_setup, work_location_id)
      `)
      .eq("id", applicationId)
      .single()

    if (appFetchError || !application) {
      return NextResponse.json({ error: appFetchError?.message || "Application not found" }, { status: 404 })
    }

    // 2. Update application status
    const { error: updateAppError } = await admin
      .from("applications")
      .update({ 
        status: "hire_confirmed", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", applicationId)

    if (updateAppError) {
      throw new Error(updateAppError.message)
    }

    // 3. Update job offer status (if it exists) and fetch latest offer work setup
    const { data: jobOffer } = await admin
      .from("job_offers")
      .select("work_mode, work_setup, work_location_id, offered_salary, salary")
      .eq("application_id", applicationId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    await admin
      .from("job_offers")
      .update({ 
        status: "HIRED", 
        updated_at: new Date().toISOString() 
      })
      .eq("application_id", applicationId)

    // Resolve tenant_id from job posting, candidate profile, or caller's profile
    const { data: candidateProfile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", application.candidate_id)
      .maybeSingle()

    let callerTenantId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user: caller } } = await supabase.auth.getUser()
      if (caller) {
        const { data: callerProfile } = await admin
          .from("profiles")
          .select("tenant_id")
          .eq("id", caller.id)
          .maybeSingle()
        callerTenantId = callerProfile?.tenant_id ?? null
      }
    } catch {
      // Ignore auth lookup errors in dev route
    }

    const jobInfo = (Array.isArray(application.job) ? application.job[0] : application.job) as {
      title?: string | null
      salary_min?: number | null
      employment_type?: string | null
      tenant_id?: string | null
      work_setup?: string | null
      work_location_id?: string | null
    } | null

    const resolvedTenantId: string | null = jobInfo?.tenant_id ?? candidateProfile?.tenant_id ?? callerTenantId ?? null

    // 4. Update profile role (and sync tenant_id if missing)
    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({
        role: "employee",
        ...(resolvedTenantId && !candidateProfile?.tenant_id ? { tenant_id: resolvedTenantId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.candidate_id)

    if (updateProfileError) {
      throw new Error(updateProfileError.message)
    }

    // 5. Create employee record
    // Check if employee already exists to avoid unique constraint error on profile_id
    const { data: existingEmployee } = await admin
      .from("employees")
      .select("id, tenant_id, job_title, base_salary, work_mode, work_location_id")
      .eq("profile_id", application.candidate_id)
      .maybeSingle()

    let employeeId = existingEmployee?.id

    const rawWorkMode = String(
      jobOffer?.work_mode ??
        jobOffer?.work_setup ??
        jobInfo?.work_setup ??
        "onsite"
    ).trim().toLowerCase()
    const workMode: "onsite" | "hybrid" | "remote" =
      rawWorkMode === "hybrid"
        ? "hybrid"
        : rawWorkMode === "remote" || rawWorkMode === "wfh"
          ? "remote"
          : "onsite"

    let workLocationId: string | null =
      jobOffer?.work_location_id ?? jobInfo?.work_location_id ?? null

    if (!workLocationId && resolvedTenantId) {
      const { data: defaultWorkLoc } = await admin
        .from("work_locations")
        .select("id")
        .eq("tenant_id", resolvedTenantId)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle()

      if (defaultWorkLoc?.id) {
        workLocationId = defaultWorkLoc.id
      } else {
        const { data: defaultBranch } = await admin
          .from("office_branches")
          .select("id")
          .eq("tenant_id", resolvedTenantId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle()
        workLocationId = defaultBranch?.id ?? null
      }
    }

    const rawJobTitle = jobInfo?.title
    const jobTitle = rawJobTitle && rawJobTitle !== "Development Employee" ? rawJobTitle : "Software Engineer"
    const rawSalary = Number(
      (jobOffer as { offered_salary?: number | null; salary?: number | null } | null)?.offered_salary ??
        (jobOffer as { offered_salary?: number | null; salary?: number | null } | null)?.salary ??
        jobInfo?.salary_min ??
        0
    )
    const baseSalary = rawSalary > 0 ? rawSalary : 35000
    const empType = jobInfo?.employment_type || "full_time"

    if (!existingEmployee) {
      const { data: newEmployee, error: createEmployeeError } = await admin
        .from("employees")
        .insert({
          profile_id: application.candidate_id,
          application_id: application.id,
          tenant_id: resolvedTenantId,
          job_title: jobTitle,
          base_salary: baseSalary,
          salary: baseSalary,
          start_date: new Date().toISOString().split('T')[0],
          employment_type: empType,
          employment_status: "active",
          work_mode: workMode,
          work_location_id: workLocationId,
        })
        .select("id")
        .single()

      if (createEmployeeError) {
        throw new Error(createEmployeeError.message)
      }
      employeeId = newEmployee.id
    } else {
      const patch: Record<string, unknown> = {}
      if (!existingEmployee.tenant_id && resolvedTenantId) patch.tenant_id = resolvedTenantId
      if (!existingEmployee.job_title || existingEmployee.job_title === "Development Employee") patch.job_title = jobTitle
      if (!existingEmployee.base_salary || Number(existingEmployee.base_salary) <= 0) {
        patch.base_salary = baseSalary
        patch.salary = baseSalary
      }
      if (!existingEmployee.work_mode) {
        patch.work_mode = workMode
      }
      if (!existingEmployee.work_location_id && workLocationId) patch.work_location_id = workLocationId
      if (Object.keys(patch).length > 0) {
        await admin.from("employees").update(patch).eq("id", existingEmployee.id)
      }
    }

    // 6. Create notification
    await admin.from("notifications").insert({
      recipient_id: application.candidate_id,
      type: "general",
      title: "Welcome to the team!",
      body: `You have been officially transitioned to an employee record.`,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ 
      success: true, 
      message: `Successfully provisioned Employee ID: ${employeeId}` 
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal mutation failed" }, 
      { status: 500 }
    )
  }
}
