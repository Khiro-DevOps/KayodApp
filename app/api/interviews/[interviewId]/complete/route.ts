import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    { error: "Interview completion is only available through the HR completion action." },
    { status: 410 },
  );
}
