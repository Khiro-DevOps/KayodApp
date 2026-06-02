'use client';

import React, { useState } from 'react';

type Tab = 'schedule' | 'leave';
type Status = 'Pending' | 'Approved' | 'Rejected';

interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: Status;
}

const StatusBadge = ({ status }: { status: Status }) => {
  const styles = {
    Pending: 'text-amber-900 bg-amber-50',
    Approved: 'text-teal-900 bg-teal-50',
    Rejected: 'text-rose-900 bg-rose-50',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
      {status}
    </span>
  );
};

export default function SchedulePage() {
  const [activeTab, setActiveTab] = useState<Tab>('schedule');

  // Dummy data for visual demonstration
  const leaveRequests: LeaveRequest[] = [
    { id: '1', type: 'Vacation', startDate: '2024-06-10', endDate: '2024-06-15', status: 'Pending' },
    { id: '2', type: 'Sick Leave', startDate: '2024-06-01', endDate: '2024-06-02', status: 'Approved' },
    { id: '3', type: 'Personal', startDate: '2024-05-20', endDate: '2024-05-21', status: 'Rejected' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'schedule' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          My Schedule
        </button>
        <button
          onClick={() => setActiveTab('leave')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'leave' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Leave Tracker
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'schedule' ? (
          <div className="p-8 text-center">
            <h2 className="text-xl font-bold text-slate-900 mb-2">My Schedule Grid</h2>
            <p className="text-slate-500">Your upcoming shifts and availability will appear here.</p>
            {/* Schedule grid implementation would go here */}
            <div className="mt-8 grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="bg-slate-50 p-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="bg-white p-4 h-24 border-t border-r border-slate-100 last:border-r-0">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Leave Tracker Filing Engine</h2>
                <p className="text-slate-500">Manage and track your time-off requests</p>
              </div>
              <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                New Request
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {leaveRequests.map((req) => (
                <div key={req.id} className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="font-medium text-slate-900">{req.type}</h3>
                    <p className="text-sm text-slate-500">
                      {req.startDate} to {req.endDate}
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
