// components/interviews/HRJitsiRoom.tsx
// HR Meeting Room — powered by 8x8 Jitsi as a Service (JaaS)

"use client";

import { useState, useEffect, useRef } from "react";
import NoteTakingPanel from "./NoteTakingPanel";
import MeetingControlBar from "./MeetingControlBar";
import type { JitsiMeetAPI } from "./jitsi.types";
import { setDisplayName } from "./jitsi.types";
import "./jitsi.types";
import { createClient } from "@/lib/supabase/client";

interface HRJitsiRoomProps {
  roomName: string;
  displayName?: string;
  email?: string;
  onClose?: () => void;
  interviewId: string;
  applicantName?: string;
}

const JAAS_APP_ID = process.env.NEXT_PUBLIC_JAAS_APP_ID ?? "";
const JAAS_DOMAIN = "8x8.vc";

export default function HRJitsiRoom({
  roomName,
  displayName = "HR Interviewer",
  email,
  onClose,
  interviewId,
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
  const [isCallActive, setIsCallActive] = useState(false);

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
                disableDeepLinking: true,
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
        setIsCallActive(false);
        onClose?.();
      });
      apiRef.current.addEventListener("videoConferenceJoined", () => {
        setIsCallActive(true);
      });
      setDisplayName(apiRef.current, displayName);
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
  const saveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomName || !notes) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: interview, error: fetchError } = await supabase
          .from("interviews")
          .select("id")
          .eq("video_room_name", roomName)
          .single();
        
        if (fetchError || !interview) {
          console.warn("Interview not found for room:", roomName);
          return;
        }

        const { error } = await supabase
          .from("interviews")
          .update({ interviewer_notes: notes })
          .eq("id", interview.id);
        
        if (error) console.error("Failed to persist interview notes:", error);
      } catch (err) {
        console.error("Failed to persist notes:", err);
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
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
        <div className="absolute inset-0 flex">
          <div
            ref={containerRef}
            className="flex-1 w-full h-full"
            style={{ backgroundColor: "#000000" }}
          />

          {isNotePanelOpen && (
            <NoteTakingPanel
              notes={notes}
              onNotesChange={setNotes}
              onClose={() => setIsNotePanelOpen(false)}
              applicantName={applicantName}
            />
          )}
        </div>

        <MeetingControlBar
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onEndCall={handleEndCall}
          onToggleNotes={() => setIsNotePanelOpen((v) => !v)}
          applicantName={applicantName}
        />
      </div>
    </div>
  );
}