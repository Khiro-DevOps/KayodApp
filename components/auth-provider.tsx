"use client";

import { createClient } from "@/lib/supabase/client";
import { logSupabaseStatus } from "@/lib/supabase/config-checker";
import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

/**
 * AuthProvider: Synchronizes Supabase auth state across the application
 * Prevents "Failed to fetch" errors during token refresh by properly handling
 * auth state changes and keeping sessions synchronized
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Log configuration status in development
    if (process.env.NODE_ENV === "development") {
      logSupabaseStatus();
    }
    
    try {
      const supabase = createClient();
      
      // Set up auth state listener to handle token refresh and sync across tabs
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_OUT") {
          // Clear any cached data on sign out
          if (process.env.NODE_ENV === "development") {
            console.log("[Auth] User signed out");
          }
          return;
        }
        
        if (event === "TOKEN_REFRESHED") {
          // Token was successfully refreshed
          if (process.env.NODE_ENV === "development") {
            console.log("[Auth] Token refreshed successfully");
          }
        }
        
        if (event === "SIGNED_IN") {
          // User signed in
          if (process.env.NODE_ENV === "development") {
            console.log("[Auth] User signed in");
          }
        }

        if (event === "USER_UPDATED") {
          // User updated
          if (process.env.NODE_ENV === "development") {
            console.log("[Auth] User updated");
          }
        }
      });

      return () => {
        subscription?.unsubscribe();
      };
    } catch (error) {
      // Silently fail if client initialization fails (e.g., in SSR context)
      if (process.env.NODE_ENV === "development") {
        console.error("[Auth] Failed to initialize auth listener:", error);
      }
    }
  }, []);

  // Don't render children until auth listener is mounted to prevent hydration mismatches
  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}
