import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import 'server-only'; // npm install server-only
import type { AuthUser, Employee, Profile } from './types';


export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}

// Fetch the full auth user (profile + employee record if applicable)
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile) return null;

  let employee: Employee | null = null;

  if (['employee', 'hr', 'admin'].includes(profile.role)) {
    const { data } = await supabase
      .from('employees')
      .select('*, company:companies(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single<Employee>();

    employee = data ?? null;
  }

  return {
    id: user.id,
    email: user.email!,
    profile,
    employee,
  };
}