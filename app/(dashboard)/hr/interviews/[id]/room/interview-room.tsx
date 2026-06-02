"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acquireMediaStream, parseMediaDeviceError } from "@/lib/media-devices";

interface InterviewRoomProps {
  roomId: string;
  interviewId: string;
  applicationId?: string;
  initialHrNotes: string | null;
  isHR: boolean;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "failed";

const statusMap: Record<ConnectionState, { label: string; color: string }> = {
  connecting: { label: "Connecting…", color: "bg-yellow-400" },
  connected: { label: "Connected", color: "bg-green-500" },
  disconnected: { label: "Disconnected", color: "bg-red-500" },
  failed: { label: "Poor connection", color: "bg-red-600" },
};

export default function InterviewRoom({ roomId, interviewId, applicationId, initialHrNotes, isHR }: InterviewRoomProps) {
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const notesRef = useRef(initialHrNotes ?? "");
  const joinPingRef = useRef<number | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const offerSentRef = useRef(false);
  const startedRef = useRef(false);
  const mediaAcquiredRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [notes, setNotes] = useState(initialHrNotes ?? "");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [hasVideo, setHasVideo] = useState(true);
  const [hasAudio, setHasAudio] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const seededNotes = initialHrNotes ?? "";
    setNotes(seededNotes);
    notesRef.current = seededNotes;
  }, [applicationId, interviewId, initialHrNotes]);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const ensureSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }

    return supabaseRef.current;
  };

  const persistHrNotes = async () => {
    if (!isHR) return;

    const response = await fetch("/api/save-hr-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, notes: notesRef.current }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to save interview notes" }));
      throw new Error(payload?.error || "Failed to save interview notes");
    }
  };

  const stopStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((track) => track.stop());
  };

  const clearJoinPing = () => {
    if (joinPingRef.current) {
      window.clearInterval(joinPingRef.current);
      joinPingRef.current = null;
    }
  };

  const setLocalPreview = (stream: MediaStream | null) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      void localVideoRef.current.play().catch((error) => {
        console.error("Browser blocked local video autoplay stream:", error);
      });
    }
  };

  const revertFromScreenShare = async () => {
    const cameraStream = localStreamRef.current;
    const sender = pcRef.current?.getSenders().find((trackSender) => trackSender.track?.kind === "video");
    const cameraTrack = cameraStream?.getVideoTracks()[0];

    if (screenShareStreamRef.current) {
      stopStream(screenShareStreamRef.current);
      screenShareStreamRef.current = null;
    }

    if (sender && cameraTrack) {
      await sender.replaceTrack(cameraTrack);
    }

    if (cameraStream) {
      setLocalPreview(cameraStream);
    }

    setIsSharing(false);
  };

  useEffect(() => {
    if (mediaAcquiredRef.current) return;
    mediaAcquiredRef.current = true;

    const supabase = ensureSupabase();
    let active = true;

    const sendJoinSignal = async () => {
      await channelRef.current?.send({
        type: "broadcast",
        event: "join",
        payload: { role: isHR ? "hr" : "applicant" },
      });
    };

    const createAndSendOffer = async () => {
      if (!pcRef.current || !channelRef.current || offerSentRef.current) return;

      offerSentRef.current = true;

      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);

      await channelRef.current.send({
        type: "broadcast",
        event: "offer",
        payload: { sdp: offer },
      });

      if (!startedRef.current) {
        startedRef.current = true;
        void supabase.from("interviews").update({ webrtc_started_at: new Date().toISOString() }).eq("id", interviewId);
      }
    };

    const setup = async () => {
      try {
        const iceResponse = await fetch("/api/turn-credentials");
        if (!iceResponse.ok) {
          throw new Error("Failed to load ICE servers");
        }

        const iceConfig = (await iceResponse.json()) as RTCConfiguration;
        
        // Gracefully acquire media devices with fallback strategy
        const mediaResult = await acquireMediaStream({
          preferVideo: true,
          preferAudio: true,
        });

        if (!mediaResult) {
          const error = new Error("No media devices available");
          const deviceErr = parseMediaDeviceError(error);
          setDeviceError(deviceErr.message);
          setConnectionState("failed");
          return;
        }

        const stream = mediaResult.stream;
        
        if (!active) {
          stopStream(stream);
          return;
        }

        // Update state with actual device availability
        setHasVideo(mediaResult.hasVideo);
        setHasAudio(mediaResult.hasAudio);

        localStreamRef.current = stream;

        setLocalPreview(stream);

        const pc = new RTCPeerConnection(iceConfig);
        pcRef.current = pc;

        stream.getTracks().forEach((track) => {
          if (track.readyState === "live") {
            pc.addTrack(track, stream);
          }
        });

        const channel = supabase.channel(`interview-room-${roomId}`);
        channelRef.current = channel;

        channel.on("broadcast", { event: "join" }, async (evt: any) => {
          const payload = evt?.payload;
          if (!isHR || offerSentRef.current || payload?.role !== "applicant") return;
          await createAndSendOffer().catch(() => setConnectionState("failed"));
        });

        channel.on("broadcast", { event: "offer" }, async (evt: any) => {
          const payload = evt?.payload;
          if (isHR || !pcRef.current) return;

          try {
            await pcRef.current.setRemoteDescription(payload.sdp);
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            await channel.send({
              type: "broadcast",
              event: "answer",
              payload: { sdp: answer },
            });
          } catch {
            setConnectionState("failed");
          }
        });

        channel.on("broadcast", { event: "answer" }, async (evt: any) => {
          const payload = evt?.payload;
          if (!isHR || !pcRef.current) return;

          try {
            await pcRef.current.setRemoteDescription(payload.sdp);
          } catch {
            setConnectionState("failed");
          }
        });

        channel.on("broadcast", { event: "ice-candidate" }, async (evt: any) => {
          const payload = evt?.payload;
          try {
            await pcRef.current?.addIceCandidate(payload.candidate);
          } catch {
            // Ignore candidate races during setup.
          }
        });

        pc.onicecandidate = ({ candidate }) => {
          if (!candidate || !channelRef.current) return;

          void channelRef.current.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { candidate },
          });
        };

        pc.ontrack = ({ streams }) => {
          const remoteStream = streams[0];

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            void remoteVideoRef.current.play().catch((error) => {
              console.error("Browser blocked remote video autoplay stream:", error);
            });
          }
          
          setHasRemoteStream(true);
        };

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          if (state === "connected") {
            clearJoinPing();
          }

          setConnectionState(
            state === "connected"
              ? "connected"
              : state === "failed"
                ? "failed"
                : state === "disconnected" || state === "closed"
                  ? "disconnected"
                  : "connecting"
          );
        };

        await channel.subscribe(async (status: string) => {
          if (!active || status !== "SUBSCRIBED") return;

          await sendJoinSignal();

          if (!isHR) {
            clearJoinPing();
            joinPingRef.current = window.setInterval(() => {
              if (pcRef.current?.connectionState === "connected") {
                clearJoinPing();
                return;
              }

              void sendJoinSignal();
            }, 2500);
            return;
          }

          if (pc.connectionState === "connected") {
            clearJoinPing();
          }
        });

      } catch (error) {
        console.error("Failed to initialize interview room:", error);
        
        // Parse device-specific errors
        if (error instanceof Error && (
          error.name === "NotFoundError" ||
          error.name === "NotAllowedError" ||
          error.name === "NotReadableError" ||
          error.name === "SecurityError"
        )) {
          const deviceErr = parseMediaDeviceError(error);
          setDeviceError(deviceErr.message);
        } else {
          setDeviceError("Failed to initialize interview. Please check your connection and try again.");
        }
        
        setConnectionState("failed");
      }
    };

    void setup();

    return () => {
      active = false;
      clearJoinPing();

      if (autosaveRef.current) {
        window.clearInterval(autosaveRef.current);
        autosaveRef.current = null;
      }

      if (screenShareStreamRef.current) {
        stopStream(screenShareStreamRef.current);
        screenShareStreamRef.current = null;
      }

      const pc = pcRef.current;
      pcRef.current = null;
      pc?.close();

      stopStream(localStreamRef.current);
      localStreamRef.current = null;

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isHR) return;

    if (autosaveRef.current) {
      window.clearInterval(autosaveRef.current);
    }

    autosaveRef.current = window.setInterval(() => {
      void persistHrNotes().catch((error) => {
        console.error("Failed to autosave interview notes:", error);
      });
    }, 10000);

    return () => {
      if (autosaveRef.current) {
        window.clearInterval(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [interviewId, isHR]);

  useEffect(() => {
    if (!isHR) return;

    const handleBeforeUnload = () => {
      const payload = new Blob([JSON.stringify({ interviewId, notes: notesRef.current })], {
        type: "application/json",
      });

      navigator.sendBeacon("/api/save-hr-notes", payload);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [interviewId, isHR]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream || !hasAudio) return;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });

    setIsMuted((prev) => !prev);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream || !hasVideo) return;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });

    setIsCameraOff((prev) => !prev);
  };

  const toggleScreenShare = async () => {
    if (!isHR) return;

    try {
      if (isSharing) {
        await revertFromScreenShare();
        return;
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((trackSender) => trackSender.track?.kind === "video");

      screenShareStreamRef.current = screenStream;

      if (sender) {
        await sender.replaceTrack(screenTrack);
      }

      setLocalPreview(screenStream);

      screenTrack.onended = () => {
        void revertFromScreenShare();
      };

      setIsSharing(true);
    } catch (error) {
      if (error instanceof Error && error.name === "NotAllowedError") {
        console.warn("Screen share cancelled by user");
      } else {
        console.error("Failed to start screen share:", error);
        setDeviceError("Failed to share screen. Please try again.");
      }
    }
  };

  const closeSessionResources = async () => {
    if (autosaveRef.current) {
      window.clearInterval(autosaveRef.current);
      autosaveRef.current = null;
    }

    if (joinPingRef.current) {
      window.clearInterval(joinPingRef.current);
      joinPingRef.current = null;
    }

    if (screenShareStreamRef.current) {
      stopStream(screenShareStreamRef.current);
      screenShareStreamRef.current = null;
    }

    const localStream = localStreamRef.current;
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    localStream?.getTracks().forEach((track) => track.stop());

    const peerConnection = pcRef.current;
    pcRef.current = null;
    peerConnection?.close();

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      await supabaseRef.current?.removeChannel(channel);
    }
  };

  const handleEndCall = async () => {
    if (isEnding) return;

    setIsEnding(true);
    try {
      if (isHR) {
        await persistHrNotes();
      }

      if (isHR) {
        const supabase = ensureSupabase();
        const { error } = await supabase
          .from("interviews")
          .update({ webrtc_ended_at: new Date().toISOString() })
          .eq("id", interviewId);

        if (error) {
          throw error;
        }
      }

      await closeSessionResources();

      if (isHR) {
        router.replace("/interviews");
        return;
      }

      router.replace("/interviews/thank-you");
    } catch (error) {
      console.error("Failed to cleanly terminate session:", error);
      if (!isHR) {
        router.replace("/interviews/thank-you");
      }
    } finally {
      setIsEnding(false);
    }
  };

  const connection = statusMap[connectionState];

  if (connectionState === "failed") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30">
            <span className="text-2xl">📵</span>
          </div>
          <h2 className="font-semibold text-white">
            {deviceError ? "Camera/Microphone Error" : "Interview room unavailable"}
          </h2>
          <p className="text-sm text-gray-400">
            {deviceError ||
              "We could not initialize the video call. Please check camera/microphone permissions and try again."}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
            >
              Retry
            </button>
            <a
              href="/interviews"
              className="block w-full rounded-xl bg-gray-800 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700"
            >
              Back to Interviews
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isHR) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
        <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">🟢</span>
            <div>
              <p className="text-sm font-semibold tracking-wide">LIVE INTERVIEW — KAYOD</p>
              <p className="text-xs text-gray-400">HR view</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`h-2.5 w-2.5 rounded-full ${connection.color}`} />
            <span>{connection.label}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black px-0 py-0 relative">
            <div className="relative flex h-full w-full items-center justify-center bg-black">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
              />
              {!hasRemoteStream && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-gray-500">Waiting for applicant…</p>
                </div>
              )}
            </div>
          </div>

          <aside className="flex w-full flex-col gap-4 border-t border-gray-800 bg-gray-900 p-4 md:w-72 md:border-l md:border-t-0 md:p-4">
            <div className="rounded-xl overflow-hidden border border-gray-800 bg-black">
              <div className="border-b border-gray-800 px-3 py-2 text-xs font-semibold text-gray-300">You (HR)</div>
              <div className="relative aspect-video bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-3 py-2">
                <span className="text-xs font-semibold text-gray-300">Interview Notes</span>
                <span className="text-xs text-gray-500">Auto-saves every 10s</span>
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-40 flex-1 resize-none bg-transparent p-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
                placeholder="Type interview notes here..."
              />
            </div>
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-4 border-t border-gray-800 bg-gray-900 px-6 py-4">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isMuted ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isMuted ? "🎤" : "🎙️"}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isCameraOff ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isCameraOff ? "📷" : "🎥"}
          </button>
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isSharing ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            🖥
          </button>
          <button
            type="button"
            onClick={() => void handleEndCall()}
            disabled={isEnding}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            📵
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-950 text-white">
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-2 md:px-6 md:py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.75)]" />
          <span className="text-xs font-medium tracking-wide text-gray-300">LIVE INTERVIEW</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className={`h-2.5 w-2.5 rounded-full ${connection.color}`} />
          <span>{connection.label}</span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black md:hidden">
        <div className="bg-gray-900 px-4 py-2 flex items-center gap-2 shrink-0 border-b border-gray-800">
          <div className={`h-2 w-2 rounded-full ${connection.color}`} />
          <span className="text-xs font-medium text-gray-300">LIVE INTERVIEW</span>
        </div>

        <div className="relative flex-1 bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />

          {!hasRemoteStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-gray-500">Waiting for interviewer...</p>
            </div>
          )}

          <div className="absolute right-3 top-3 h-[90px] w-[120px] overflow-hidden rounded-xl border-2 border-gray-700 shadow-lg md:hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-6 border-t border-gray-800 bg-gray-900 px-6 py-4">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isMuted ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isMuted ? "🎤" : "🎙️"}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isCameraOff ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isCameraOff ? "📷" : "🎥"}
          </button>
          <button
            type="button"
            onClick={() => void handleEndCall()}
            disabled={isEnding}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            📵
          </button>
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex">
        <div className="relative flex min-h-0 flex-1 bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />

          {!hasRemoteStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-gray-500">Waiting for interviewer...</p>
            </div>
          )}

          <div className="absolute right-6 top-6 h-40 w-56 overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
            <div className="border-b border-gray-800 px-3 py-2 text-xs font-semibold text-gray-300">You (Applicant)</div>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-[calc(100%-2rem)] w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-4 border-t border-gray-800 bg-gray-900 px-6 py-4">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isMuted ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isMuted ? "🎤" : "🎙️"}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isCameraOff ? "bg-red-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            {isCameraOff ? "📷" : "🎥"}
          </button>
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isSharing ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            🖥
          </button>
          <button
            type="button"
            onClick={() => void handleEndCall()}
            disabled={isEnding}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            📵
          </button>
        </div>
      </div>
    </div>
  );
}