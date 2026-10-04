'use client';

import React, { useState, useTransition } from 'react';
import { updateNotificationPreference } from '@/lib/actions/updatePreferences';
import { Check, Loader2, AlertCircle } from 'lucide-react';

interface NotificationPreferencesCardProps {
  initialEmail: boolean;
  initialPush: boolean;
}

export default function NotificationPreferencesCard({
  initialEmail = true,
  initialPush = true,
}: NotificationPreferencesCardProps) {
  const [emailActive, setEmailActive] = useState<boolean>(initialEmail);
  const [pushActive, setPushActive] = useState<boolean>(initialPush);
  const [savingKey, setSavingKey] = useState<'email' | 'push' | null>(null);
  const [savedKey, setSavedKey] = useState<'email' | 'push' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (key: 'email' | 'push') => {
    const nextVal = key === 'email' ? !emailActive : !pushActive;
    setErrorMsg(null);
    setSavingKey(key);

    // Optimistically toggle state
    if (key === 'email') setEmailActive(nextVal);
    else setPushActive(nextVal);

    startTransition(async () => {
      const field = key === 'email' ? 'email_notifications' : 'push_notifications';
      const result = await updateNotificationPreference(field, nextVal);

      setSavingKey(null);

      if (result.success) {
        setSavedKey(key);
        setTimeout(() => setSavedKey(null), 2500);
      } else {
        // Rollback on failure
        if (key === 'email') setEmailActive(!nextVal);
        else setPushActive(!nextVal);
        setErrorMsg(result.error || 'Failed to save setting');
      }
    });
  };

  const preferences = [
    {
      id: 'email' as const,
      label: 'Email Notifications',
      description: 'Receive application, leave, and payroll updates via email',
      active: emailActive,
    },
    {
      id: 'push' as const,
      label: 'Push Reminders',
      description: 'Get real-time browser & device alerts for urgent HR actions',
      active: pushActive,
    },
  ];

  return (
    <div className="bg-white border border-outline-variant rounded-[32px] p-8 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-primary tracking-[0.2em] uppercase border-l-4 border-primary pl-4">
          PREFERENCES
        </h3>
        {errorMsg && (
          <span className="flex items-center gap-1 text-xs font-semibold text-rose-600">
            <AlertCircle className="w-3.5 h-3.5" />
            {errorMsg}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {preferences.map((pref) => {
          const isSaving = savingKey === pref.id;
          const isJustSaved = savedKey === pref.id;

          return (
            <div key={pref.id} className="flex items-center justify-between gap-4 group">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                    {pref.label}
                  </span>
                  {isSaving && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                    </span>
                  )}
                  {isJustSaved && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant opacity-75 mt-0.5">
                  {pref.description}
                </p>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => handleToggle(pref.id)}
                aria-label={`Toggle ${pref.label}`}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                  pref.active ? 'bg-primary' : 'bg-outline-variant'
                } ${isPending ? 'opacity-80 cursor-wait' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs ${
                    pref.active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
