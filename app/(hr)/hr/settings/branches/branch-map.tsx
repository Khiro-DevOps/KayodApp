"use client";

import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

const NOMINATIM_HEADERS = { "User-Agent": "Kayod HR branch picker/1.0 (support@kayod.app)" };

function MapEvents({ onLocationChange, radius, target, disabled = false }: { onLocationChange: (lat: number, lng: number, address: string) => void; radius: number; target: [number, number] | null; disabled?: boolean }) {
  const map = useMap();
  const [center, setCenter] = useState(map.getCenter());
  useMapEvents({
    click: (event) => {
      if (disabled) return;
      map.panTo(event.latlng);
    },
    moveend: () => {
      if (disabled) return;
      const next = map.getCenter();
      setCenter(next);
      void fetch(`/api/geocode/reverse?lat=${next.lat}&lon=${next.lng}`, { headers: NOMINATIM_HEADERS })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => onLocationChange(next.lat, next.lng, data?.display_name ?? ""));
    },
  });
  useEffect(() => { map.invalidateSize(); }, [map]);
  useEffect(() => { if (target) map.flyTo(target, Math.max(map.getZoom(), 15)); }, [map, target]);
  return <Circle center={center} radius={radius} pathOptions={{ color: "#6d28d9", fillOpacity: 0.12 }} />;
}

export default function BranchMap({ latitude, longitude, radius, target, onLocationChange, disabled = false }: { latitude: number; longitude: number; radius: number; target: [number, number] | null; onLocationChange: (lat: number, lng: number, address: string) => void; disabled?: boolean }) {
  return <div className={`relative h-full min-h-[280px] ${disabled ? "pointer-events-none opacity-80" : ""}`}><MapContainer center={[latitude, longitude]} zoom={latitude === 12.8797 ? 6 : 15} dragging={!disabled} scrollWheelZoom={!disabled} doubleClickZoom={!disabled} touchZoom={!disabled} boxZoom={!disabled} keyboard={!disabled} zoomControl={!disabled} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapEvents onLocationChange={onLocationChange} radius={radius} target={target} disabled={disabled} /></MapContainer><div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full"><div className="h-8 w-8 rounded-full rounded-br-none border-4 border-white bg-primary shadow-lg rotate-45" /></div></div>;
}
