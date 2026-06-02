import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

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
        job:job_postings(title, salary_min, employment_type)
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

    // 4. Update profile role
    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({ 
        role: "employee", 
        updated_at: new Date().toISOString() 
      })
      .eq("id", application.candidate_id)

    if (updateProfileError) {
      throw new Error(updateProfileError.message)
    }

    // 5. Create employee record
    // Check if employee already exists to avoid unique constraint error on profile_id
    const { data: existingEmployee } = await admin
      .from("employees")
      .select("id")
      .eq("profile_id", application.candidate_id)
      .maybeSingle()

    let employeeId = existingEmployee?.id

    if (!existingEmployee) {
      // @ts-ignore - job is a joined object
      const jobTitle = application.job?.title || "Manual Promotion"
      // @ts-ignore
      const baseSalary = application.job?.salary_min || 50000
      // @ts-ignore
      const empType = application.job?.employment_type || "full_time"

      const { data: newEmployee, error: createEmployeeError } = await admin
        .from("employees")
        .insert({
          profile_id: application.candidate_id,
          application_id: application.id,
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
