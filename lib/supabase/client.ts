import { createBrowserClient } from "@supabase/ssr";

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (typeof window === "undefined") {
    throw new Error("createClient() can only be called in the browser");
  }

  if (clientInstance) {
    return clientInstance;
  }

  try {
    clientInstance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    if (process.env.NODE_ENV === "development") {
      console.log("[Supabase] Browser client initialized");
    }
    
    return clientInstance;
  } catch (error) {
    console.error("[Supabase] Failed to initialize browser client:", error);
    throw error;
  }
}
