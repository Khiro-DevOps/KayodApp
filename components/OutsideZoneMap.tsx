'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface OutsideZoneMapProps {
  work_lat: number;
  work_lng: number;
  work_radius_m: number;
  current_lat: number;
  current_lng: number;
  isWithinZone: boolean;
}

// Fix for Leaflet marker icon missing in Next.js builds
const icon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function OutsideZoneMap({
  work_lat,
  work_lng,
  work_radius_m,
  current_lat,
  current_lng,
  isWithinZone,
}: OutsideZoneMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || typeof window === 'undefined') return null;

  const zoneColor = isWithinZone ? '#10b981' : '#e11d48'; // Emerald Green vs Crimson Red

  return (
    <div className="w-full h-full min-h-[300px] relative rounded-xl overflow-hidden border border-slate-200 shadow-inner">
      <MapContainer
        center={[work_lat, work_lng]}
        zoom={16}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Work Site Boundary */}
        <Circle
          center={[work_lat, work_lng]}
          radius={work_radius_m}
          pathOptions={{
            color: zoneColor,
            fillColor: zoneColor,
            fillOpacity: 0.15,
            weight: 2,
            dashArray: isWithinZone ? '' : '5, 10'
          }}
        />

        {/* Work Site Center */}
        <Circle
          center={[work_lat, work_lng]}
          radius={5}
          pathOptions={{ color: '#334155', fillColor: '#334155', fillOpacity: 1 }}
        />

        {/* Employee Current Position */}
        <Marker position={[current_lat, current_lng]} icon={icon}>
          <Popup>
            <div className="text-xs font-sans">
              <p className="font-bold text-slate-900">Current Position</p>
              <p className="text-slate-500">
                {isWithinZone ? 'Inside Geofence' : 'Outside Geofence'}
              </p>
            </div>
          </Popup>
        </Marker>
      </MapContainer>

      {/* Legend Overlay */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-lg border border-slate-200 shadow-sm text-[10px] uppercase tracking-wider font-bold space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: zoneColor }} />
          <span>{isWithinZone ? 'Compliant' : 'Violation'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-700" />
          <span>Registered Site</span>
        </div>
      </div>
    </div>
  );
}
