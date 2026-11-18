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
        job:job_postings(title, salary_min, employment_type, tenant_id)
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

    // 3. Update job offer status (if it exists)
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

    // @ts-ignore - job is a joined object
    const resolvedTenantId: string | null = application.job?.tenant_id ?? candidateProfile?.tenant_id ?? callerTenantId ?? null

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
      .select("id, tenant_id, job_title, base_salary")
      .eq("profile_id", application.candidate_id)
      .maybeSingle()

    let employeeId = existingEmployee?.id

    // @ts-ignore - job is a joined object
    const rawJobTitle = application.job?.title
    const jobTitle = rawJobTitle && rawJobTitle !== "Development Employee" ? rawJobTitle : "Software Engineer"
    // @ts-ignore
    const rawSalary = Number(application.job?.salary_min || 0)
    const baseSalary = rawSalary > 0 ? rawSalary : 45000
    // @ts-ignore
    const empType = application.job?.employment_type || "full_time"

    if (!existingEmployee) {
      const { data: newEmployee, error: createEmployeeError } = await admin
        .from("employees")
        .insert({
          profile_id: application.candidate_id,
          application_id: application.id,
          tenant_id: resolvedTenantId,
          job_title: jobTitle,
          base_salary: baseSalary,
          start_date: new Date().toISOString().split('T')[0],
          employment_type: empType,
          employment_status: "active",
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
      if (!existingEmployee.base_salary || Number(existingEmployee.base_salary) <= 0) patch.base_salary = baseSalary
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
