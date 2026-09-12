'use client';

import React, { useState, useEffect } from 'react';
import { calculateHaversineDistance } from '@/lib/haversine';
import { CheckCircle2, AlertTriangle, Lock, Loader2, MapPin } from 'lucide-react';
import dynamic from 'next/dynamic';

const OutsideZoneMap = dynamic(() => import('./OutsideZoneMap'), {
  ssr: false,
  loading: () => <div className="text-xs text-indigo-600 animate-pulse p-4">Loading interactive map...</div>
});

interface ClockInModuleProps {
  isOnLeave: boolean;
  profile: {
    work_setup?: string | null;
    work_radius_m: number;
    work_lat: number;
    work_lng: number;
    location_name?: string | null;
  };
  onClockIn?: (lat: number | null, lng: number | null, withinZone: boolean) => void;
}

type ExecutionState = 'initializing' | 'secured' | 'violation' | 'blocked';

export default function ClockInModule({ isOnLeave, profile, onClockIn }: ClockInModuleProps) {
  const [state, setState] = useState<ExecutionState>('initializing');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [errorHeader, setErrorHeader] = useState('');

  const isRemote = profile.work_setup === 'remote' || profile.work_setup === 'wfh';

  useEffect(() => {
    if (isOnLeave) return;

    if (isRemote) {
      setState('secured');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setState('blocked');
      setErrorHeader('Geolocation Not Supported');
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });

        // Compare live GPS coords against dynamic site reference location
        const dist = calculateHaversineDistance(
          latitude,
          longitude,
          profile.work_lat,
          profile.work_lng
        );
        setDistance(dist);

        if (dist <= profile.work_radius_m) {
          setState('secured');
        } else {
          setState('violation');
        }
      },
      (err) => {
        setState('blocked');
        if (err.code === 1) setErrorHeader('Permission Denied');
        else setErrorHeader('Location Error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [isOnLeave, profile, isRemote]);

  if (isOnLeave) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-900 shadow-sm">
        <Lock className="w-5 h-5 shrink-0" />
        <span className="font-medium text-sm">Clock-in disabled: You are currently on approved leave</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 space-y-6">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Attendance Clock-In</h2>
            {profile.location_name && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Site: <strong className="text-slate-700">{profile.location_name}</strong></span>
              </p>
            )}
          </div>
          {isRemote && (
            <span className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-full uppercase border border-teal-200">
              Remote / WFH
            </span>
          )}
        </header>

        {state === 'initializing' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Verifying dynamic geofence location...</p>
          </div>
        )}

        {state === 'secured' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-100 rounded-xl text-teal-900">
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
              <div className="text-sm font-medium">
                Zone Compliance Verified
                {distance !== null && (
                  <span className="block text-xs text-teal-700 opacity-90 font-normal mt-0.5">
                    {Math.round(distance)}m from registered site (Radius: {profile.work_radius_m}m)
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onClockIn?.(coords?.lat ?? null, coords?.lng ?? null, true)}
              className="w-full py-3.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm"
            >
              Clock In Now
            </button>
          </div>
        )}

        {state === 'violation' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-sm font-medium">
                Boundary Violation Detected
                <span className="block text-xs text-rose-700 opacity-90 font-normal mt-0.5">
                  Current distance: {distance ? Math.round(distance) : '...'}m (Allowed: max {profile.work_radius_m}m)
                </span>
              </div>
            </div>
            <div className="h-64 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
              <OutsideZoneMap
                work_lat={profile.work_lat}
                work_lng={profile.work_lng}
                work_radius_m={profile.work_radius_m}
                current_lat={coords?.lat ?? 0}
                current_lng={coords?.lng ?? 0}
                isWithinZone={false}
              />
            </div>
            <button disabled className="w-full py-3.5 bg-slate-100 text-slate-400 rounded-xl font-bold cursor-not-allowed border border-slate-200">
              Entry Locked (Outside Assigned Geofence)
            </button>
          </div>
        )}

        {state === 'blocked' && (
          <div className="space-y-4">
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-600">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-sm">{errorHeader}</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                System Access Blocked. To enable clock-in, please allow location access in your browser or device settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
