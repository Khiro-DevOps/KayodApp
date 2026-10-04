"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// Dynamically import Leaflet Map to bypass SSR
const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });

// Helper to create Leaflet custom icons in client side
function useLeafletIcons() {
  const [icons, setIcons] = useState<{
    officeIcon?: any;
    userIcon?: any;
  }>({});

  useEffect(() => {
    import("leaflet").then((L) => {
      const officeIcon = L.divIcon({
        className: "custom-office-pin",
        html: `
          <div style="
            background-color: #7c3aed;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 4px 10px rgba(124, 58, 237, 0.4);
            border: 2px solid white;
          ">
            <span class="material-symbols-outlined" style="font-size: 20px;">location_on</span>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const userIcon = L.divIcon({
        className: "custom-user-dot",
        html: `
          <div style="position: relative; width: 24px; height: 24px;">
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background-color: #3b82f6;
              opacity: 0.4;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
            <div style="
              position: relative;
              width: 16px;
              height: 16px;
              margin: 4px;
              border-radius: 50%;
              background-color: #2563eb;
              border: 2px solid white;
              box-shadow: 0 2px 6px rgba(37, 99, 235, 0.5);
            "></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      setIcons({ officeIcon, userIcon });
    });
  }, []);

  return icons;
}

interface WorkspaceMapProps {
  targetLocation: { lat: number; lng: number; label: string };
  userLocation: { lat: number; lng: number } | null;
}

export default function WorkspaceMap({ targetLocation, userLocation }: WorkspaceMapProps) {
  const [mounted, setMounted] = useState(false);
  const { officeIcon, userIcon } = useLeafletIcons();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 text-xs text-text-secondary">
        Loading Map Viewport...
      </div>
    );
  }

  const mapCenter: [number, number] = [targetLocation.lat, targetLocation.lng];

  return (
    <div className="h-full w-full relative">
      <style jsx global>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
      <MapContainer
        center={mapCenter}
        zoom={15}
        scrollWheelZoom={false}
        className="h-full w-full z-0"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Workspace / Office Pin */}
        {officeIcon && (
          <Marker position={[targetLocation.lat, targetLocation.lng]} icon={officeIcon}>
            <Popup>
              <div className="text-xs font-semibold">{targetLocation.label}</div>
            </Popup>
          </Marker>
        )}

        {/* Current User Pulsing Blue Dot */}
        {userLocation && userIcon && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Popup>
              <div className="text-xs font-semibold">Your Current Location</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
