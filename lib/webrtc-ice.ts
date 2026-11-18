export interface BuildIceServersEnv {
  NEXT_PUBLIC_STUN_URL?: string;
  NEXT_PUBLIC_TURN_URL?: string;
  TURN_URL?: string;
  NEXT_PUBLIC_TURN_USERNAME?: string;
  TURN_USERNAME?: string;
  NEXT_PUBLIC_TURN_CREDENTIAL?: string;
  TURN_CREDENTIAL?: string;
  [key: string]: string | undefined;
}

export const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

export function buildIceServers(env: BuildIceServersEnv = process.env): RTCIceServer[] {
  const stunUrl = env.NEXT_PUBLIC_STUN_URL?.trim() || DEFAULT_STUN_URL;
  const iceServers: RTCIceServer[] = [{ urls: stunUrl }];

  const turnUrl = (env.NEXT_PUBLIC_TURN_URL ?? env.TURN_URL)?.trim();
  if (turnUrl) {
    const turnUsername = (env.NEXT_PUBLIC_TURN_USERNAME ?? env.TURN_USERNAME)?.trim();
    const turnCredential = (env.NEXT_PUBLIC_TURN_CREDENTIAL ?? env.TURN_CREDENTIAL)?.trim();

    iceServers.push({
      urls: turnUrl,
      ...(turnUsername ? { username: turnUsername } : {}),
      ...(turnCredential ? { credential: turnCredential } : {}),
    });
  }

  return iceServers;
}
