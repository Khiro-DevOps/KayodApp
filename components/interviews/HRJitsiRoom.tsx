// components/interviews/HRJitsiRoom.tsx
// HR Meeting Room — powered by 8x8 Jitsi as a Service (JaaS)

"use client";

import { useState, useEffect, useRef } from "react";
import NoteTakingPanel from "./NoteTakingPanel";
import MeetingControlBar from "./MeetingControlBar";
import type { JitsiMeetAPI } from "./jitsi.types";
import "./jitsi.types";

interface HRJitsiRoomProps {
  roomName: string;
  displayName?: string;
  email?: string;
  onClose?: () => void;
  applicantName?: string;
}

const JAAS_APP_ID = process.env.NEXT_PUBLIC_JAAS_APP_ID ?? "";
const JAAS_DOMAIN = "8x8.vc";

export default function HRJitsiRoom({
  roomName,
  displayName = "HR Interviewer",
  email,
  onClose,
  applicantName = "Applicant",
}: HRJitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [isNotePanelOpen, setIsNotePanelOpen] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
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
            displayName,
            email,
            moderator: true, // HR is moderator
          }),
        });
        if (!res.ok) throw new Error("Failed to fetch JaaS token");
        const data = await res.json();
        setJwtToken(data.token);
      } catch (err) {
        setTokenError("Could not initialize meeting. Please refresh.");
        console.error(err);
      }
    }
    fetchToken();
  }, [roomName, displayName, email]);

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
        userInfo: {
          displayName,
          ...(email && { email }),
        },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          disableSimulcast: false,
          disableTileView: true,
          filmstrip: {
            enabled: true,
            position: "top",
          },
          verticalFilmstrip: false,
          remoteVideoMenu: {
            disableKick: true,
          },
          toolbarButtons: [
            "microphone",
            "camera",
            "desktop",
            "fullscreen",
            "hangup",
            "chat",
          ],
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

      apiRef.current.addEventListener("readyToClose", () => {
        onClose?.();
      });
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
  }, [jwtToken, roomName, displayName, email, onClose]);

  // Persist notes
  useEffect(() => {
    localStorage.setItem(`interview-notes-${roomName}`, notes);
  }, [notes, roomName]);

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
    onClose?.();
  };

  if (tokenError) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center space-y-3">
          <p className="text-white text-sm">{tokenError}</p>
          <button
            onClick={onClose}
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
        <p className="text-white text-sm animate-pulse">Starting meeting…</p>
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
          applicantName={applicantName}
        />

        <button
          onClick={() => setIsNotePanelOpen(!isNotePanelOpen)}
          className="absolute bottom-24 right-6 z-20 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center text-white font-bold text-xl hover:scale-110 active:scale-95"
          title="Toggle Notes"
        >
          📝
        </button>

        {isNotePanelOpen && (
          <NoteTakingPanel
            notes={notes}
            onNotesChange={setNotes}
            onClose={() => setIsNotePanelOpen(false)}
            applicantName={applicantName}
          />
        )}
      </div>
    </div>
  );
}