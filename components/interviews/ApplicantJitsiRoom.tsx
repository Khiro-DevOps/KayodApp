"use client";

import { useState, useEffect, useRef } from "react";
import MeetingControlBar from "./MeetingControlBar";
import type { JitsiMeetOptions, JitsiMeetAPI } from "./jitsi.types";
import "./jitsi.types"; // Import global type augmentations

interface ApplicantJitsiRoomProps {
  roomName: string;
  userName: string;
  onLeave: () => void;
  interviewerName?: string;
}

const JITSI_SERVER = process.env.NEXT_PUBLIC_JITSI_SERVER ?? "meet.jit.si";

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

  // Initialize Jitsi with custom layout
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

      // If applicant hangs up from inside the Jitsi UI
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
      script.src = `https://${JITSI_SERVER}/external_api.js`;
      script.async = true;
      script.onload = initJitsi;
      document.head.appendChild(script);
    }

    return () => {
      apiRef.current?.dispose();
    };
  }, [roomName, userName, onLeave]);

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
    onLeave();
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
          applicantName={interviewerName}
        />
      </div>
    </div>
  );
}