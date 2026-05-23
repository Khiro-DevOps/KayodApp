import 'server-only';
import type { NextRequest } from 'next/server';

export async function GET(_req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return new Response(JSON.stringify({ error: 'Not available in production' }), { status: 403 });
  }

  const vars = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    DOCUSEAL_API_KEY: Boolean(process.env.DOCUSEAL_API_KEY),
    DOCUSEAL_API_URL: Boolean(process.env.DOCUSEAL_API_URL),
  };

  return new Response(JSON.stringify({ nodeEnv: process.env.NODE_ENV ?? null, vars }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
