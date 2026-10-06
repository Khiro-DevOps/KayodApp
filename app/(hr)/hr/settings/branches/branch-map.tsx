"use client";

import { Circle, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

const NOMINATIM_HEADERS = { "User-Agent": "Kayod HR branch picker/1.0 (support@kayod.app)" };

function MapEvents({ onLocationChange, radius, target }: { onLocationChange: (lat: number, lng: number, address: string) => void; radius: number; target: [number, number] | null }) {
  const map = useMap();
  const [center, setCenter] = useState(map.getCenter());
  useMapEvents({ moveend: () => { const next = map.getCenter(); setCenter(next); void fetch(`/api/geocode/reverse?lat=${next.lat}&lon=${next.lng}`, { headers: NOMINATIM_HEADERS }).then((response) => response.ok ? response.json() : null).then((data) => onLocationChange(next.lat, next.lng, data?.display_name ?? "")); } });
  useEffect(() => { map.invalidateSize(); }, [map]);
  useEffect(() => { if (target) map.flyTo(target, Math.max(map.getZoom(), 15)); }, [map, target]);
  return <Circle center={center} radius={radius} pathOptions={{ color: "#6d28d9", fillOpacity: 0.12 }} />;
}

export default function BranchMap({ latitude, longitude, radius, target, onLocationChange }: { latitude: number; longitude: number; radius: number; target: [number, number] | null; onLocationChange: (lat: number, lng: number, address: string) => void }) {
  return <div className="relative h-full min-h-[280px]"><MapContainer center={[latitude, longitude]} zoom={latitude === 12.8797 ? 6 : 15} className="h-full w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapEvents onLocationChange={onLocationChange} radius={radius} target={target} /></MapContainer><div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full"><div className="h-8 w-8 rounded-full rounded-br-none border-4 border-white bg-primary shadow-lg rotate-45" /></div></div>;
}
