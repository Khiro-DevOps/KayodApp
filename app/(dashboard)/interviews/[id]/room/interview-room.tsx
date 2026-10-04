"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
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
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [notes, setNotes] = useState(initialHrNotes ?? "");
  const [evaluation, setEvaluation] = useState<"poor" | "avg" | "excel" | null>(null);
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

  const safePlayVideo = async (videoElement: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!videoElement || !stream) return;

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
      try {
        await videoElement.play();
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "AbortError") {
          console.error("Video play error:", error);
        }
      }
    }
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
    void safePlayVideo(localVideoRef.current, stream);
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
    const supabase = ensureSupabase();
    let active = true;
    const pendingIceCandidates: RTCIceCandidateInit[] = [];

    const sendJoinSignal = async () => {
      if (!active) return;
      await channelRef.current?.send({
        type: "broadcast",
        event: "join",
        payload: { role: isHR ? "hr" : "applicant" },
      });
    };

    const createAndSendOffer = async () => {
      if (!active || !pcRef.current || !channelRef.current || offerSentRef.current) return;

      offerSentRef.current = true;

      const offer = await pcRef.current.createOffer();
      if (!active) return;
      await pcRef.current.setLocalDescription(offer);
      if (!active) return;

      await channelRef.current.send({
        type: "broadcast",
        event: "offer",
        payload: { sdp: offer },
      });

    };

    const setup = async () => {
      try {
        const iceResponse = await fetch("/api/turn-credentials");
        if (!active) return;
        if (!iceResponse.ok) {
          throw new Error("Failed to load ICE servers");
        }

        const iceConfig = (await iceResponse.json()) as RTCConfiguration;
        if (!active) return;

        // Gracefully acquire media devices with fallback strategy
        const mediaResult = await acquireMediaStream({
          preferVideo: true,
          preferAudio: true,
        });

        if (!active) {
          if (mediaResult?.stream) stopStream(mediaResult.stream);
          return;
        }

        if (!mediaResult) {
          const error = new Error("No media devices available");
          const deviceErr = parseMediaDeviceError(error);
          setDeviceError(deviceErr.message);
          setConnectionState("failed");
          return;
        }

        const stream = mediaResult.stream;

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

        const applyRemoteDescription = async (description: RTCSessionDescriptionInit) => {
          await pc.setRemoteDescription(description);
          for (const candidate of pendingIceCandidates.splice(0)) {
            await pc.addIceCandidate(candidate);
          }
        };

        channel.on("broadcast", { event: "join" }, async (evt: any) => {
          if (!active) return;
          const payload = evt?.payload;
          if (!isHR || offerSentRef.current || payload?.role !== "applicant") return;
          await createAndSendOffer().catch(() => {
            if (active) setConnectionState("failed");
          });
        });

        channel.on("broadcast", { event: "offer" }, async (evt: any) => {
          if (!active) return;
          const payload = evt?.payload;
          if (isHR || !pcRef.current) return;

          try {
            await applyRemoteDescription(payload.sdp);
            if (!active) return;
            const answer = await pcRef.current.createAnswer();
            if (!active) return;
            await pcRef.current.setLocalDescription(answer);
            if (!active) return;
            await channel.send({
              type: "broadcast",
              event: "answer",
              payload: { sdp: answer },
            });
          } catch {
            if (active) setConnectionState("failed");
          }
        });

        channel.on("broadcast", { event: "answer" }, async (evt: any) => {
          if (!active) return;
          const payload = evt?.payload;
          if (!isHR || !pcRef.current) return;

          try {
            await applyRemoteDescription(payload.sdp);
          } catch {
            if (active) setConnectionState("failed");
          }
        });

        channel.on("broadcast", { event: "ice-candidate" }, async (evt: any) => {
          if (!active) return;
          const payload = evt?.payload;
          try {
            if (!payload?.candidate || !pcRef.current) return;
            if (pcRef.current.remoteDescription) {
              await pcRef.current.addIceCandidate(payload.candidate);
            } else {
              pendingIceCandidates.push(payload.candidate);
            }
          } catch {
            if (active) setConnectionState("failed");
          }
        });

        pc.onicecandidate = ({ candidate }) => {
          if (!active || !candidate || !channelRef.current) return;

          void channelRef.current.send({
            type: "broadcast",
            event: "ice-candidate",
            payload: { candidate },
          });
        };

        pc.ontrack = (event) => {
          if (!active) return;
          const remoteStream = event.streams[0];
          if (!remoteStream) return;

          void safePlayVideo(remoteVideoRef.current, remoteStream);

          setHasRemoteStream(true);
        };

        pc.onconnectionstatechange = () => {
          if (!active) return;
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
              if (!active || pcRef.current?.connectionState === "connected") {
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
        if (!active) return;
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
      offerSentRef.current = false;
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
  }, [interviewId, isHR, roomId]);

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
          .from("interview_schedules")
          .update({ status: "completed", updated_at: new Date().toISOString() })
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

      router.replace(isHR ? "/hr/interviews" : "/applicant/interviews");
    } catch (error) {
      console.error("Failed to cleanly terminate session:", error);
      if (!isHR) {
        router.replace(isHR ? "/hr/interviews" : "/applicant/interviews");
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
              href={isHR ? "/hr/interviews" : "/applicant/interviews"}
              className="block w-full rounded-xl bg-gray-800 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700"
            >
              Back to Interviews
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-slate-950 text-white">
      <div className="relative h-full w-full overflow-hidden bg-slate-950">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />

        {!hasRemoteStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-slate-400">Waiting for {isHR ? "applicant" : "interviewer"}...</p>
          </div>
        )}

        <div className="absolute right-6 top-6 z-20 h-52 w-40 overflow-hidden rounded-2xl border-2 border-white/80 bg-slate-900 object-cover shadow-2xl sm:h-60 sm:w-48">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>

        <div className="absolute left-6 top-6 z-20 flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-md backdrop-blur-xl">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span>{connection.label}</span>
        </div>

        {isHR && (
          <div className="absolute bottom-20 right-6 z-20 w-80 space-y-3 rounded-2xl border border-white/60 bg-white/85 p-4 text-slate-900 shadow-2xl backdrop-blur-xl sm:w-96">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">INTERVIEW NOTES</p>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-24 w-full resize-none rounded-xl border border-slate-200/80 bg-white/70 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              placeholder="Add notes during the interview..."
            />
            <div className="flex items-center gap-2">
              {(["poor", "avg", "excel"] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setEvaluation(rating)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${evaluation === rating ? "border-purple-600 bg-purple-600 text-white" : "border-slate-200 bg-white/90 text-slate-700 hover:bg-purple-600 hover:text-white"}`}
                >
                  {rating === "avg" ? "AVG" : rating.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/60 bg-white/80 px-6 py-3 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={toggleMute}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            className="rounded-full border border-slate-200/60 bg-slate-100/90 p-3 text-slate-800 transition-all hover:bg-slate-200"
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            title={isCameraOff ? "Turn camera on" : "Turn camera off"}
            aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
            className="rounded-full border border-slate-200/60 bg-slate-100/90 p-3 text-slate-800 transition-all hover:bg-slate-200"
          >
            {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button
            type="button"
            onClick={() => void handleEndCall()}
            disabled={isEnding}
            title="End call"
            aria-label="End call"
            className="rounded-full bg-rose-600 p-3 text-white shadow-lg transition-all hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PhoneOff size={20} />
          </button>
        </div>

        <div className="absolute bottom-6 left-6 z-20 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-800 shadow-md backdrop-blur-xl">
          {isHR ? "Jay Gomez (Candidate)" : "Interviewer (HR)"}
        </div>
      </div>
    </div>
  );
}