export type VideoProvider = "webrtc" | "jitsi";

export function getDefaultVideoProvider(): VideoProvider {
  return process.env.NEXT_PUBLIC_VIDEO_PROVIDER === "jitsi" ? "jitsi" : "webrtc";
}
