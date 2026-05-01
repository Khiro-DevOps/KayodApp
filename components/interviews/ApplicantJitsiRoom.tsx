// components/interviews/ApplicantJitsiRoom.tsx
// Applicant Meeting Room — powered by 8x8 Jitsi as a Service (JaaS)

"use client";

import { useState, useEffect, useRef } from "react";
import MeetingControlBar from "./MeetingControlBar";
import type { JitsiMeetAPI } from "./jitsi.types";
import "./jitsi.types";

interface ApplicantJitsiRoomProps {
  roomName: string;
  userName: string;
  onLeave: () => void;
  interviewerName?: string;
}

const JAAS_APP_ID = process.env.NEXT_PUBLIC_JAAS_APP_ID ?? "";
const JAAS_DOMAIN = "8x8.vc";

export default function ApplicantJitsiRoom({
  roomName,
  userName,
  onLeave,
  interviewerName = "Interviewer",
}: ApplicantJitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Step 1: Fetch a signed JWT from your API route
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch("/api/jaas-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomName,
            displayName: userName,
            moderator: false, // Applicant is NOT a moderator
          }),
        });
        if (!res.ok) throw new Error("Failed to fetch JaaS token");
        const data = await res.json();
        setJwtToken(data.token);
      } catch (err) {
        setTokenError("Could not join the meeting. Please try again.");
        console.error(err);
      }
    }
    fetchToken();
  }, [roomName, userName]);

  // Step 2: Init Jitsi once JWT is ready
  useEffect(() => {
    if (!jwtToken) return;

    const scriptId = "jitsi-external-api";
    const scriptSrc = `https://${JAAS_DOMAIN}/${JAAS_APP_ID}/external_api.js`;

    const initJitsi = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;

      apiRef.current?.dispose();

      apiRef.current = new window.JitsiMeetExternalAPI(JAAS_DOMAIN, {
        roomName: `${JAAS_APP_ID}/${roomName}`,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        jwt: jwtToken,
        userInfo: { displayName: userName },
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          disableSimulcast: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          TOOLBAR_BUTTONS: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
          ],
          DEFAULT_BACKGROUND: "#000000",
          HIDE_INVITE_MORE_HEADER: true,
        },
      });

      apiRef.current.addEventListener("readyToClose", onLeave);
    };

    const existing = document.getElementById(scriptId);
    if (existing && window.JitsiMeetExternalAPI) {
      initJitsi();
    } else if (existing) {
      existing.addEventListener("load", initJitsi);
    } else {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = scriptSrc;
      script.async = true;
      script.onload = initJitsi;
      document.head.appendChild(script);
    }

    return () => {
      apiRef.current?.dispose();
    };
  }, [jwtToken, roomName, userName, onLeave]);

  const handleToggleMute = () => {
    apiRef.current?.executeCommand("toggleAudio");
    setIsMuted((v) => !v);
  };

  const handleToggleCamera = () => {
    apiRef.current?.executeCommand("toggleVideo");
    setIsVideoOff((v) => !v);
  };

  const handleEndCall = () => {
    apiRef.current?.executeCommand("hangup");
    onLeave();
  };

  if (tokenError) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center space-y-3">
          <p className="text-white text-sm">{tokenError}</p>
          <button
            onClick={onLeave}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!jwtToken) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <p className="text-white text-sm animate-pulse">Joining meeting…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          style={{ backgroundColor: "#000000" }}
        />

        <MeetingControlBar
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onEndCall={handleEndCall}
          applicantName={interviewerName}
        />
      </div>
    </div>
  );
}