import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function calculateAgeFromBirthdate(value: string): number | null {
  const birthdate = new Date(value);
  if (Number.isNaN(birthdate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();
  const dayDiff = today.getDate() - birthdate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < 0 || age > 120) return null;
  return age;
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function emailLocalPart(email: string | null | undefined): string {
  return (email ?? "").split("@")[0]?.trim() ?? "";
}

function formatHandleAsName(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveNamesFromUser(user: {
  email?: string | null;
  user_metadata?: unknown;
  raw_user_meta_data?: unknown;
}): { firstName: string; lastName: string } {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (user.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const firstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const lastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) {
    const [first, ...rest] = fullName.split(/\s+/);
    return {
      firstName: first ?? "",
      lastName: rest.join(" "),
    };
  }

  const fallback = formatHandleAsName(emailLocalPart(user.email));
  return {
    firstName: fallback || "User",
    lastName: "",
  };
}

function getRawUserMetadata(user: unknown): Record<string, unknown> {
  const raw = (user as { raw_user_meta_data?: unknown } | null)?.raw_user_meta_data;
  return (raw ?? {}) as Record<string, unknown>;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, address, city, country, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profileFirstName = normalizeName(data.first_name);
  const profileLastName = normalizeName(data.last_name);

  if (!profileFirstName && !profileLastName) {
    const { firstName, lastName } = deriveNamesFromUser(user);
    if (firstName || lastName) {
      await adminClient
        .from("profiles")
        .update({ first_name: firstName, last_name: lastName })
        .eq("id", user.id);

      data.first_name = firstName;
      data.last_name = lastName;
    }
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
    date_of_birth?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
  };

  if (body.date_of_birth) {
    const age = calculateAgeFromBirthdate(body.date_of_birth);
    if (age === null) {
      return NextResponse.json({ error: "Invalid birthdate" }, { status: 400 });
    }
  }

  const payload = {
    date_of_birth: body.date_of_birth ?? null,
    address: body.address?.trim() || null,
    city: body.city?.trim() || null,
    country: body.country?.trim() || "Philippines",
  };

  const adminClient = getAdminClient();

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
  }

  if (!existingProfile) {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const rawMetadata = getRawUserMetadata(user);

    const { firstName, lastName } = deriveNamesFromUser(user);
    const roleRaw = metadata.role ?? rawMetadata.role;
    const phoneRaw = metadata.phone ?? rawMetadata.phone ?? "";

    const role = typeof roleRaw === "string" && roleRaw.trim().length > 0 ? roleRaw.trim() : "candidate";
    const phone = typeof phoneRaw === "string" ? phoneRaw.trim() : "";

    const { error: insertError } = await adminClient
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        first_name: firstName,
        last_name: lastName,
        role,
        phone,
        ...payload,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { data, error } = await adminClient
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
    .select("id, role, first_name, last_name, email, phone, avatar_url, date_of_birth, address, city, country, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Profile update returned no row" }, { status: 500 });
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}