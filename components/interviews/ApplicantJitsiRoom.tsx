"use client";

import { useState, useEffect } from "react";

interface ApplicantJitsiRoomProps {
  roomName: string;
  userName: string;
  onLeave: () => void;
}

export default function ApplicantJitsiRoom({
  roomName,
  userName,
  onLeave,
}: ApplicantJitsiRoomProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) {
        const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
          roomName,
          width: "100%",
          height: "100%",
          parentNode: document.querySelector("#applicant-jitsi-container"),
          userInfo: { displayName: userName },
          configOverwrite: { startWithAudioMuted: true },
        });

        // If applicant hangs up from inside the Jitsi UI
        api.addEventListeners({ readyToClose: onLeave });

        setLoading(false);
      }
    };
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [roomName, userName, onLeave]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="p-4 bg-gray-900 flex justify-between items-center text-white">
        <h2 className="font-bold">Interview in Progress</h2>
        <button
          onClick={onLeave}
          className="bg-red-600 hover:bg-red-700 transition-colors px-4 py-2 rounded text-sm font-medium"
        >
          Leave Meeting
        </button>
      </div>
      <div className="flex-grow relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            Initializing Encrypted Connection...
          </div>
        )}
        <div id="applicant-jitsi-container" className="h-full w-full" />
      </div>
    </div>
  );
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}