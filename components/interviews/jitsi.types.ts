// Shared Jitsi types to avoid duplication across components

export interface JitsiMeetOptions {
  roomName: string;
  parentNode: HTMLElement;
  width?: string | number;
  height?: string | number;
  jwt?: string; // Required for 8x8 JaaS authentication
  userInfo?: { displayName?: string; email?: string };
  configOverwrite?: Record<string, unknown>;
  interfaceConfigOverwrite?: Record<string, unknown>;
}

export interface JitsiMeetAPI {
  dispose: () => void;
  addEventListener: (event: string, cb: () => void) => void;
  addEventListeners: (events: Record<string, () => void>) => void;
  executeCommand: (command: string, ...args: any[]) => void;
}

// Extend global Window to include Jitsi API
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: JitsiMeetOptions
    ) => JitsiMeetAPI;
  }
}