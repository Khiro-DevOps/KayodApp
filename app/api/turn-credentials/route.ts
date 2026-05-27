export async function GET() {
  return Response.json({
    iceServers: [
      { urls: process.env.NEXT_PUBLIC_STUN_URL },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      },
    ],
  });
}