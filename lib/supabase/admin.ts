import { createClient } from "@supabase/supabase-js";

// Admin client using service role key - bypasses RLS
// This is only available on the server with the service role key
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

