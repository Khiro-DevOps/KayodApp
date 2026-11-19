import { createClient } from "@/lib/supabase/server";
import { buildIceServers } from "@/lib/webrtc-ice";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return Response.json(
    {
      iceServers: buildIceServers(process.env),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}