'use client';

import React, { useState, useEffect } from 'react';
import { calculateHaversineDistance } from '@/lib/haversine';
import { MapPin, CheckCircle2, AlertTriangle, Lock, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const OutsideZoneMap = dynamic(() => import('./OutsideZoneMap'), {
  ssr: false,
  loading: () => <div className="text-body-sm text-indigo-600 animate-pulse">Loading map viewport...</div>
});


interface ClockInModuleProps {
  isOnLeave: boolean;
  profile: {
    work_setup: 'on_site' | 'remote' | 'hybrid';
    work_radius_m: number;
    work_lat: number;
    work_lng: number;
  };
  onClockIn: (lat: number | null, lng: number | null, withinZone: boolean) => void;
}

type ExecutionState = 'initializing' | 'secured' | 'violation' | 'blocked';

export default function ClockInModule({ isOnLeave, profile, onClockIn }: ClockInModuleProps) {
  const [state, setState] = useState<ExecutionState>('initializing');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [errorHeader, setErrorHeader] = useState('');

  useEffect(() => {
    if (isOnLeave) return;

    if (profile.work_setup === 'remote') {
      setState('secured');
      return;
    }

    if (!navigator.geolocation) {
      setState('blocked');
      setErrorHeader('Geolocation Not Supported');
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        
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
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [isOnLeave, profile]);

  if (isOnLeave) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900">
        <Lock className="w-5 h-5" />
        <span className="font-medium">Clock-in disabled: You are currently on approved leave</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-6 space-y-6">
        <header className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-900">Attendance Module</h2>
          {profile.work_setup === 'remote' && (
            <span className="px-2 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded uppercase">Remote Mode</span>
          )}
        </header>

        {state === 'initializing' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Initializing Security Check...</p>
          </div>
        )}

        {state === 'secured' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-100 rounded-xl text-teal-900">
              <CheckCircle2 className="w-5 h-5 text-teal-600" />
              <div className="text-sm font-medium">
                Zone Compliance Secured
                {distance !== null && <span className="block text-xs text-teal-700 opacity-80 font-normal">Within {Math.round(distance)}m of site</span>}
              </div>
            </div>
            <button 
              onClick={() => onClockIn(coords?.lat ?? null, coords?.lng ?? null, true)}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all active:scale-[0.98]"
            >
              Clock In Now
            </button>
          </div>
        )}

        {state === 'violation' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <div className="text-sm font-medium">
                Boundary Violation Tracked
                <span className="block text-xs text-rose-700 opacity-80 font-normal">
                  Current distance: {distance ? Math.round(distance) : '...'}m (Max: {profile.work_radius_m}m)
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
            <button disabled className="w-full py-4 bg-slate-200 text-slate-400 rounded-xl font-bold cursor-not-allowed">
              Entry Locked
            </button>
          </div>
        )}

        {state === 'blocked' && (
          <div className="space-y-4">
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2 text-rose-600 mb-3">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold">{errorHeader}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                System Access Blocked. To enable clock-in, please allow location access in your browser or OS settings. 
                For mobile devices, ensure Location Services are toggled 'On'.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
