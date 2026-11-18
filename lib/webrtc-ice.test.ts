import { describe, expect, it } from "vitest";
import { buildIceServers, DEFAULT_STUN_URL } from "@/lib/webrtc-ice";
import { getRoomAccess } from "@/lib/interview-room-access";

describe("buildIceServers", () => {
  it("falls back to Google STUN when env vars are empty", () => {
    expect(buildIceServers({})).toEqual([{ urls: DEFAULT_STUN_URL }]);
    expect(buildIceServers({ NEXT_PUBLIC_STUN_URL: "   ", TURN_URL: "" })).toEqual([
      { urls: DEFAULT_STUN_URL },
    ]);
  });

  it("uses custom STUN URL when NEXT_PUBLIC_STUN_URL is set", () => {
    expect(buildIceServers({ NEXT_PUBLIC_STUN_URL: "stun:stun.example.com:3478" })).toEqual([
      { urls: "stun:stun.example.com:3478" },
    ]);
  });

  it("appends TURN server when TURN_URL is set", () => {
    expect(
      buildIceServers({
        TURN_URL: "turn:turn.example.com:3478",
        TURN_USERNAME: "alice",
        TURN_CREDENTIAL: "secret",
      })
    ).toEqual([
      { urls: DEFAULT_STUN_URL },
      {
        urls: "turn:turn.example.com:3478",
        username: "alice",
        credential: "secret",
      },
    ]);
  });
});

describe("getRoomAccess", () => {
  const scheduledAt = "2026-11-18T10:00:00.000Z";

  it("returns open inside T-10 to end+15 window", () => {
    const inside = new Date("2026-11-18T09:55:00.000Z");
    const access = getRoomAccess(
      { scheduled_at: scheduledAt, duration_minutes: 60, status: "scheduled", meeting_type: "online" },
      inside
    );
    expect(access.state).toBe("open");
  });

  it("returns too_early before T-10", () => {
    const early = new Date("2026-11-18T09:49:00.000Z");
    const access = getRoomAccess(
      { scheduled_at: scheduledAt, duration_minutes: 60, status: "scheduled", meeting_type: "online" },
      early
    );
    expect(access.state).toBe("too_early");
  });

  it("returns ended at or after end+15", () => {
    const late = new Date("2026-11-18T11:15:00.000Z");
    const access = getRoomAccess(
      { scheduled_at: scheduledAt, duration_minutes: 60, status: "scheduled", meeting_type: "online" },
      late
    );
    expect(access.state).toBe("ended");
  });

  it("blocks in_person interviews", () => {
    const inside = new Date("2026-11-18T10:05:00.000Z");
    const access = getRoomAccess(
      { scheduled_at: scheduledAt, duration_minutes: 60, status: "scheduled", meeting_type: "in_person" },
      inside
    );
    expect(access.state).toBe("closed");
  });
});
