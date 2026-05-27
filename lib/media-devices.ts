/**
 * Graceful media device access with fallback strategy
 */

export interface MediaDeviceError {
  type: "NotAllowedError" | "NotFoundError" | "NotReadableError" | "SecurityError" | "Unknown";
  message: string;
  originalError: Error;
}

export interface MediaStreamOptions {
  preferVideo?: boolean;
  preferAudio?: boolean;
}

/**
 * Attempts to acquire media devices with graceful fallback
 * Tries: video + audio → audio only → permission denied
 */
export async function acquireMediaStream(
  options: MediaStreamOptions = { preferVideo: true, preferAudio: true }
): Promise<{ stream: MediaStream; hasVideo: boolean; hasAudio: boolean } | null> {
  // Try with both video and audio
  if (options.preferVideo && options.preferAudio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return {
        stream,
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: stream.getAudioTracks().length > 0,
      };
    } catch (error) {
      console.warn("Failed to acquire video + audio, trying audio only:", error);
      // Continue to try audio only
    }
  }

  // Try audio only
  if (options.preferAudio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      return {
        stream,
        hasVideo: false,
        hasAudio: stream.getAudioTracks().length > 0,
      };
    } catch (error) {
      console.warn("Failed to acquire audio:", error);
      // Continue to try video only if requested
    }
  }

  // Try video only as last resort
  if (options.preferVideo) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      return {
        stream,
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: false,
      };
    } catch (error) {
      console.warn("Failed to acquire video:", error);
    }
  }

  // All attempts failed
  console.error("Failed to acquire any media devices");
  return null;
}

/**
 * Parses media device errors into user-friendly messages
 */
export function parseMediaDeviceError(error: any): MediaDeviceError {
  const originalError = error instanceof Error ? error : new Error(String(error));
  const name = originalError.name;

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      type: "NotAllowedError",
      message:
        "Camera/microphone access denied. Please check your browser permissions and try again.",
      originalError,
    };
  }

  if (name === "NotFoundError") {
    return {
      type: "NotFoundError",
      message: "No camera or microphone found. Please check your device setup.",
      originalError,
    };
  }

  if (name === "NotReadableError") {
    return {
      type: "NotReadableError",
      message: "Camera/microphone is in use by another application. Please close other apps and try again.",
      originalError,
    };
  }

  if (name === "SecurityError") {
    return {
      type: "SecurityError",
      message:
        "This page is not secure (HTTPS required). Please use HTTPS to access camera/microphone.",
      originalError,
    };
  }

  return {
    type: "Unknown",
    message: "Failed to access camera/microphone. Please try again.",
    originalError,
  };
}

/**
 * Checks if devices are available without requesting permission
 */
export async function checkAvailableDevices(): Promise<{ hasCamera: boolean; hasMicrophone: boolean }> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some((d) => d.kind === "videoinput");
    const hasMicrophone = devices.some((d) => d.kind === "audioinput");
    return { hasCamera, hasMicrophone };
  } catch (error) {
    console.warn("Could not enumerate devices:", error);
    return { hasCamera: false, hasMicrophone: false };
  }
}
