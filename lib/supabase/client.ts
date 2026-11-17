import { createBrowserClient } from "@supabase/ssr";

const globalForSupabase = globalThis as unknown as {
  __supabaseBrowserClient?: ReturnType<typeof createBrowserClient>;
  __supabaseAuthLocks?: Record<string, Promise<unknown>>;
};

async function inProcessLock<R>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const locks = (globalForSupabase.__supabaseAuthLocks ??= {});
  const previous = locks[name] ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => fn());
  locks[name] = next.catch(() => undefined);
  return next;
}

export function createClient() {
  if (typeof window === "undefined") {
    throw new Error("createClient() can only be called in the browser");
  }

  if (globalForSupabase.__supabaseBrowserClient) {
    return globalForSupabase.__supabaseBrowserClient;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
      );
    }

    const clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        lock: inProcessLock,
      },
    });

    globalForSupabase.__supabaseBrowserClient = clientInstance;

    if (process.env.NODE_ENV === "development") {
      console.log("[Supabase] Browser client initialized successfully");
    }

    return clientInstance;
  } catch (error) {
    console.error("[Supabase] Failed to initialize browser client:", error);
    throw error;
  }
}
