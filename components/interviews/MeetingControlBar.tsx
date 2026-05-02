"use client";

import { FC } from "react";

interface MeetingControlBarProps {
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onToggleNotes?: () => void;
  applicantName?: string;
}

const MeetingControlBar: FC<MeetingControlBarProps> = ({
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  onToggleNotes,
  applicantName = "Applicant",
}) => {
  return (
    <>
      {/* Status Bar (top) */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-6 py-4 flex justify-between items-center text-white">
        <h2 className="font-semibold text-lg">Interview with {applicantName}</h2>
        <div className="flex gap-2 text-sm">
          {isMuted && (
            <span className="bg-red-600/80 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
              🔇 Muted
            </span>
          )}
          {isVideoOff && (
            <span className="bg-red-600/80 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
              📹 Camera Off
            </span>
          )}
        </div>
      </div>

      {/* Control Buttons (centered bottom) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex gap-4">
        {/* Mute Button */}
        <button
          onClick={onToggleMute}
          className={`w-14 h-14 rounded-full transition-all shadow-lg flex items-center justify-center text-xl font-bold active:scale-95 ${
            isMuted
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-white"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? "🔇" : "🎤"}
        </button>

        {/* Camera Button */}
        <button
          onClick={onToggleCamera}
          className={`w-14 h-14 rounded-full transition-all shadow-lg flex items-center justify-center text-xl font-bold active:scale-95 ${
            isVideoOff
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-white"
          }`}
          title={isVideoOff ? "Turn on camera" : "Turn off camera"}
        >
          {isVideoOff ? "📹" : "📷"}
        </button>

        {/* Screen Share Button */}
        <button
          className="w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-600 transition-all shadow-lg flex items-center justify-center text-white text-xl font-bold active:scale-95"
          title="Share screen"
        >
          🖥️
        </button>

        {/* End Call Button */}
        <button
          onClick={onEndCall}
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 transition-all shadow-lg flex items-center justify-center text-white text-xl font-bold active:scale-95"
          title="End call"
        >
          ☎️
        </button>

          {/* Notes Toggle Button (optional) */}
          {onToggleNotes && (
            <button
              onClick={onToggleNotes}
              className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center text-white text-xl font-bold active:scale-95"
              title="Toggle notes"
            >
              📝
            </button>
          )}
      </div>
    </>
  );
};

export default MeetingControlBar;
