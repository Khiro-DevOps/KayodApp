import { createClient } from "@/lib/supabase/server";
import { reverseNominatim } from "@/lib/nominatim";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["hr", "hr_manager", "admin"].includes(String(profile?.role))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  try { return Response.json(await reverseNominatim(lat, lon)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Geocoding failed" }, { status: 502 }); }
}
