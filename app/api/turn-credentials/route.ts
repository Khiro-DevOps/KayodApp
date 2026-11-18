import { buildIceServers } from "@/lib/webrtc-ice";

export async function GET() {
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