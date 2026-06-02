import React from 'react';
import { getAuthUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from './ProfileForm';

export const metadata = {
  title: 'Employee Profile | Kayod HR',
  description: 'Manage your workplace settings and profile information.',
};

export default async function ProfilePage() {
  const auth = await getAuthUser();

  if (!auth) {
    redirect('/auth/login');
  }

  return (
    <main className="min-h-screen bg-slate-50/50 py-12 px-4 md:px-8">
      <div className="max-w-6xl mx-auto space-y-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Personal Workspace</h1>
          <nav className="flex gap-4 text-sm font-medium text-slate-500">
            <span className="text-slate-900 border-b-2 border-slate-900 pb-1">Profile Settings</span>
            <span className="hover:text-slate-700 cursor-pointer">Security</span>
            <span className="hover:text-slate-700 cursor-pointer">Notifications</span>
          </nav>
        </header>

        <section>
          <ProfileForm profile={auth.profile} />
        </section>
      </div>
    </main>
  );
}
