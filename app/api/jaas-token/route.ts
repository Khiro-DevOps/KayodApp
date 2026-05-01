// app/api/jaas-token/route.ts
// Generates a signed JWT for 8x8 JaaS (Jitsi as a Service).
// This MUST run server-side — the private key must never be exposed to the browser.

import { NextRequest, NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { v4 as uuidv4 } from "uuid";

const JAAS_APP_ID = process.env.JAAS_APP_ID!;         // e.g. vpaas-magic-cookie-abc123
const JAAS_KEY_ID = process.env.JAAS_KEY_ID!;         // e.g. vpaas-magic-cookie-abc123/key-id
const JAAS_PRIVATE_KEY = process.env.JAAS_PRIVATE_KEY!; // Full RSA private key (PEM format)

export async function POST(req: NextRequest) {
  try {
    const { roomName, displayName, email, moderator } = await req.json();

    if (!JAAS_APP_ID || !JAAS_KEY_ID || !JAAS_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "JaaS credentials not configured" },
        { status: 500 }
      );
    }

    // Import the RSA private key
    const privateKey = await importPKCS8(JAAS_PRIVATE_KEY, "RS256");

    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
      aud: "jitsi",
      iss: "chat",
      sub: JAAS_APP_ID,
      room: "*", // allow access to any room under this app
      context: {
        features: {
          livestreaming: false,
          "outbound-call": false,
          transcription: false,
          recording: false,
        },
        user: {
          id: uuidv4(),
          name: displayName ?? "User",
          email: email ?? "",
          moderator: Boolean(moderator),
          avatar: "",
        },
      },
    })
      .setProtectedHeader({ alg: "RS256", kid: JAAS_KEY_ID, typ: "JWT" })
      .setIssuedAt(now)
      .setNotBefore(now - 10)                // 10s leeway
      .setExpirationTime(now + 60 * 60)      // 1 hour
      .sign(privateKey);

    return NextResponse.json({ token });
  } catch (err) {
    console.error("JaaS token generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}