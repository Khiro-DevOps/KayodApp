import { createClient } from "@/lib/supabase/server";
import { searchNominatim } from "@/lib/nominatim";

async function authorized() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return ["hr", "hr_manager", "admin"].includes(String(data?.role));
}

export async function GET(request: Request) {
  if (!await authorized()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return Response.json({ data: [] });
  try { return Response.json({ data: await searchNominatim(query) }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Geocoding failed" }, { status: 502 }); }
}
