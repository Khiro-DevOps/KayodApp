import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function parseAge(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return numeric;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, age, address, city, country, created_at, updated_at")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    age?: number | string | null;
    date_of_birth?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
  };

  const age = parseAge(body.age);
  if (body.age !== undefined && body.age !== null && body.age !== "" && age === null) {
    return NextResponse.json({ error: "Age must be a whole number" }, { status: 400 });
  }

  if (age !== null && (age < 0 || age > 120)) {
    return NextResponse.json({ error: "Age must be between 0 and 120" }, { status: 400 });
  }

  if (body.date_of_birth) {
    const dob = new Date(body.date_of_birth);
    if (Number.isNaN(dob.getTime())) {
      return NextResponse.json({ error: "Invalid birthdate" }, { status: 400 });
    }
  }

  const payload = {
    age,
    date_of_birth: body.date_of_birth ?? null,
    address: body.address?.trim() || null,
    city: body.city?.trim() || null,
    country: body.country?.trim() || "Philippines",
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, age, address, city, country, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}
