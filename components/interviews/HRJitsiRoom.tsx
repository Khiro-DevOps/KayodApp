// components/interviews/HRJitsiRoom.tsx
// Embeds Jitsi Meet directly on the HR interview page — no redirect.

"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: JitsiMeetOptions
    ) => JitsiMeetAPI;
  }
}

interface JitsiMeetOptions {
  roomName: string;
  parentNode: HTMLElement;
  width?: string | number;
  height?: string | number;
  userInfo?: { displayName?: string; email?: string };
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
}

interface JitsiMeetAPI {
  dispose: () => void;
  addEventListener: (event: string, cb: () => void) => void;
}

interface HRJitsiRoomProps {
  roomName: string;
  displayName?: string;
  email?: string;
  onClose?: () => void;
}

const JITSI_SERVER = process.env.NEXT_PUBLIC_JITSI_SERVER ?? "meet.jit.si";

export default function HRJitsiRoom({
  roomName,
  displayName = "HR Interviewer",
  email,
  onClose,
}: HRJitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);

  useEffect(() => {
    const scriptId = "jitsi-external-api";

const initJitsi = () => {
  if (!containerRef.current || !window.JitsiMeetExternalAPI) return; // guard

  // Dispose any existing instance before creating a new one
  apiRef.current?.dispose();

  apiRef.current = new window.JitsiMeetExternalAPI(JITSI_SERVER, {
    roomName,
    parentNode: containerRef.current,
    width: "100%",
    height: "100%",
    userInfo: {
      displayName,
      ...(email && { email }),
    },
    configOverwrite: {
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      enableWelcomePage: false,
      prejoinPageEnabled: false,
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      TOOLBAR_BUTTONS: [
        "microphone", "camera", "closedcaptions", "desktop",
        "fullscreen", "fodeviceselection", "hangup", "chat",
        "recording", "raisehand", "videoquality", "tileview",
        "participants-pane",
      ],
    },
  });

  apiRef.current.addEventListener("readyToClose", () => {
    onClose?.();
  });
};

const existing = document.getElementById(scriptId);
if (existing && window.JitsiMeetExternalAPI) {
  // Script already loaded — init directly
  initJitsi();
} else if (existing) {
  // Script tag exists but not yet loaded — wait for it
  existing.addEventListener("load", initJitsi);
} else {
  // First load — create the script tag
  const script = document.createElement("script");
  script.id = scriptId;
  script.src = `https://${JITSI_SERVER}/external_api.js`;
  script.async = true;
  script.onload = initJitsi;
  document.head.appendChild(script);
}

    return () => {
      apiRef.current?.dispose();
    };
  }, [roomName, displayName, email, onClose]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden border border-border shadow-md"
      style={{ height: "600px" }}
    />
  );
}