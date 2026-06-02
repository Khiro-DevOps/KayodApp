'use client';

import React, { useState } from 'react';
import { resolveAddress } from '@/lib/actions/resolveAddress';
import { MapPin, AlertCircle, Save, CheckCircle } from 'lucide-react';
import type { Profile } from '@/lib/types';

interface ProfileFormProps {
  profile: Profile;
}

export default function ProfileForm({ profile }: ProfileFormProps) {
  const [address, setAddress] = useState(profile.work_address || '');
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleAddressResolution = async (newAddress: string) => {
    if (!newAddress || newAddress === profile.work_address) return;
    
    setIsResolving(true);
    setError(null);
    setIsSaved(false);

    try {
      const result = await resolveAddress(profile.id, newAddress);
      
      if (!result.success) {
        setError(result.error || "Failed to resolve address.");
      } else {
        setAddress(newAddress);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
      }
    } catch (err) {
      setError("An unexpected error occurred during address resolution.");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 font-h2">Workplace Settings</h2>
        <p className="text-sm text-slate-500 font-body">Manage your primary work location and attendance parameters.</p>
      </div>

      <div className="space-y-4">
        <label htmlFor="work_address" className="block text-sm font-semibold text-slate-700">
          Workplace Physical Address
        </label>
        
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <MapPin className={`w-5 h-5 ${isResolving ? 'text-indigo-500 animate-bounce' : 'text-slate-400 group-focus-within:text-indigo-600'}`} />
          </div>
          <input
            id="work_address"
            type="text"
            className="block w-full pl-11 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 focus:bg-white transition-all text-sm"
            placeholder="e.g., 123 Business Ave, Tech City"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={(e) => handleAddressResolution(e.target.value)}
          />
          {isSaved && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <CheckCircle className="w-5 h-5 text-teal-500" />
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 text-rose-950 bg-rose-50 border border-rose-200/60 p-3 rounded-xl mt-2 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{error}</p>
          </div>
        )}

        <p className="text-[11px] text-slate-400 italic">
          Note: This address is used to verify geofence boundaries during clock-in. Ensure it is accurate.
        </p>
      </div>

      <div className="pt-6 border-t border-slate-100 flex justify-end">
        <button 
          disabled={isResolving}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          {isResolving ? 'Resolving...' : <><Save className="w-4 h-4" /> Update Workspace</>}
        </button>
      </div>
    </div>
  );
}
