import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import 'server-only';
import type { Employee, Profile } from '@/lib/types';

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
            // Ignore in Server Components
          }
        },
      },
    }
  );
}

export async function getAuthUser(): Promise<{
  id: string;
  email: string;
  profile: Profile;
  employee: Employee | null;
} | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile) return null;

  let employee: Employee | null = null;

  if (['employee', 'hr_manager', 'admin'].includes(profile.role)) {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('profile_id', user.id)
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