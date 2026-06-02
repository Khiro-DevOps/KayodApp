'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShieldAlert, CheckCircle2, User, Clock, MapPin, ShieldCheck } from 'lucide-react';

interface AttendanceRecord {
  id: string;
  employee_name: string;
  timestamp: string;
  within_zone: boolean;
  hr_override: boolean;
  lat?: number;
  lng?: number;
}

interface AttendanceDashboardProps {
  initialAttendance: AttendanceRecord[];
}

export default function AttendanceDashboard({ initialAttendance }: AttendanceDashboardProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>(initialAttendance || []);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        { event: '*', table: 'attendance' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRecords(prev => [payload.new as AttendanceRecord, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setRecords(prev => prev.map(rec => 
              rec.id === payload.new.id ? { ...rec, ...payload.new } : rec
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const onToggleOverride = async (id: string) => {
    const record = records.find(r => r.id === id);
    if (!record) return;

    const { error } = await supabase
      .from('attendance')
      .update({ hr_override: !record.hr_override })
      .eq('id', id);

    if (error) console.error('Override failed:', error);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Real-Time Telemetry Intake</h1>
          <p className="text-slate-500">Monitoring live workforce attendance and zone compliance</p>
        </div>
        <div className="flex gap-2">
          <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg shadow-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-slate-600">Live Intake Active</span>
          </div>
        </div>
      </header>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-bottom border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Employee</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Intake Time</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Compliance</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status/Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-slate-900">{rec.employee_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="w-4 h-4 opacity-50" />
                      <span className="text-sm">{new Date(rec.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {!rec.within_zone ? (
                      <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 border border-rose-100 rounded-lg w-fit">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        <span className="text-xs font-bold text-rose-900 uppercase">Boundary Breach</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-100 rounded-lg w-fit">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-xs font-bold text-teal-900 uppercase">Within Zone</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onToggleOverride(rec.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                        rec.hr_override 
                          ? 'bg-slate-900 text-white shadow-md' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {rec.hr_override ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4 opacity-50" />}
                      {rec.hr_override ? 'Override Active' : 'Clear Breach'}
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                    Waiting for real-time intake telemetry...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
