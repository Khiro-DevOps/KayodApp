// components/interviews/HRJitsiRoom.tsx
// HR Meeting Room with custom layout: PIP self-view, full-screen remote video, and control bar.
// Notes are taken AFTER the interview using the post-interview notes page.

"use client";

import { useState, useEffect, useRef } from "react";
import MeetingControlBar from "./MeetingControlBar";
import type { JitsiMeetOptions, JitsiMeetAPI } from "./jitsi.types";
import "./jitsi.types"; // Import global type augmentations

interface HRJitsiRoomProps {
  roomName: string;
  displayName?: string;
  email?: string;
  onClose?: () => void;
  applicantName?: string;
}

const JITSI_SERVER = process.env.NEXT_PUBLIC_JITSI_SERVER ?? "meet.jit.si";

export default function HRJitsiRoom({
  roomName,
  displayName = "HR Interviewer",
  email,
  onClose,
  applicantName = "Applicant",
}: HRJitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Initialize Jitsi with custom layout injection
  useEffect(() => {
    const scriptId = "jitsi-external-api";

    const initJitsi = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;

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
        apiRef.current?.dispose();
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
      script.src = `https://${JITSI_SERVER}/external_api.js`;
      script.async = true;
      script.onload = initJitsi;
      document.head.appendChild(script);
    }

    // Prevent Jitsi from navigating away
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const jitsiClose = document.querySelector('[data-testid="app.menu.aboutTitle"]') || 
                         document.querySelector('div[style*="https://meet.jit.si"]');
      if (jitsiClose) {
        e.preventDefault();
        e.returnValue = false;
        apiRef.current?.dispose();
        onClose?.();
        return false;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      apiRef.current?.dispose();
    };
  }, [roomName, displayName, email, onClose]);



  const handleToggleMute = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("toggleAudio");
      setIsMuted(!isMuted);
    }
  };

  const handleToggleCamera = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("toggleVideo");
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndCall = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("hangup");
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Video Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Remote Video (full-screen background) */}
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundColor: "#000000",
          }}
        />

        {/* Control Bar (centered bottom) */}
        <MeetingControlBar
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onEndCall={handleEndCall}
          applicantName={applicantName}
        />
      </div>
    </div>
  );
}