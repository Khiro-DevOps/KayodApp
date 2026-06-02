import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

let cachedUserPromise: Promise<any | null> | null = null;

export async function fetchUserOnce(): Promise<any | null> {
  if (typeof window === "undefined") return null;

  if (cachedUserPromise) return cachedUserPromise;

  cachedUserPromise = (async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    } catch (err) {
      // clear cache on failure so callers can retry later
      cachedUserPromise = null;
      throw err;
    }
  })();

  return cachedUserPromise;
}

export function useAuth() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const u = await fetchUserOnce();
        if (!mounted) return;
        setUser(u);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || String(err));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { user, loading, error } as const;
}
