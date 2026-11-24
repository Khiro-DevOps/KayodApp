"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const BranchMap = dynamic(
  () => import("@/app/(hr)/hr/settings/branches/branch-map"),
  { ssr: false },
);

interface LocationPinPickerProps {
  address: string;
  latitude: number;
  longitude: number;
  radius?: number;
  disabled?: boolean;
  onChange: (next: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
}

export default function LocationPinPicker({
  address,
  latitude,
  longitude,
  radius = 200,
  disabled = false,
  onChange,
}: LocationPinPickerProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    Array<{ lat: string; lon: string; display_name: string }>
  >([]);
  const [target, setTarget] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    if (disabled || search.trim().length < 3) {
      return;
    }
    const timer = window.setTimeout(() => {
      void fetch(`/api/geocode/search?q=${encodeURIComponent(search.trim())}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setResults(data?.data ?? []))
        .catch(() => setResults([]));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [disabled, search]);

  return (
    <div className="space-y-3">
      <div className="relative h-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <BranchMap
          latitude={latitude}
          longitude={longitude}
          radius={radius}
          target={target}
          disabled={disabled}
          onLocationChange={(lat, lng, nextAddress) => {
            if (disabled) return;
            const fallbackAddress = `Pinned Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
            onChange({
              latitude: lat,
              longitude: lng,
              address: (nextAddress && nextAddress.trim()) || address.trim() || fallbackAddress,
            });
          }}
        />

        <div className="absolute left-14 right-3 top-3 z-[1001]">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              disabled={disabled}
              value={search}
              onChange={(e) => {
                if (disabled) return;
                const next = e.target.value;
                setSearch(next);
                if (next.trim().length < 3) setResults([]);
              }}
              placeholder="Search Philippine address..."
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                setGeoError("");
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const next: [number, number] = [
                      position.coords.latitude,
                      position.coords.longitude,
                    ];
                    setTarget(next);
                    const fallbackAddress = `Pinned Location (${next[0].toFixed(5)}, ${next[1].toFixed(5)})`;
                    onChange({
                      latitude: next[0],
                      longitude: next[1],
                      address: address.trim() || fallbackAddress,
                    });
                  },
                  () => setGeoError("Location permission was denied."),
                );
              }}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#1E1B4B] shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Use Current GPS Location
            </button>
          </div>

          {!disabled && results.length > 0 && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
              {results.map((result) => (
                <button
                  key={`${result.lat}-${result.lon}`}
                  type="button"
                  onClick={() => {
                    const nextLat = Number(result.lat);
                    const nextLng = Number(result.lon);
                    setTarget([nextLat, nextLng]);
                    onChange({
                      latitude: nextLat,
                      longitude: nextLng,
                      address: result.display_name,
                    });
                    setResults([]);
                    setSearch("");
                  }}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs text-slate-700 last:border-0 hover:bg-indigo-50/50"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {geoError ? (
        <p className="text-xs font-medium text-rose-600">{geoError}</p>
      ) : null}

      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-gray-700">
          Selected WFH Address
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) =>
            onChange({
              address: e.target.value,
              latitude,
              longitude,
            })
          }
          placeholder="Search above or drag the map pin to set your address..."
          className="w-full rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-all focus:border-[#1E1B4B] focus:ring-2 focus:ring-[#1E1B4B]/15"
        />
        <p className="text-[11px] text-slate-500">
          Pinned Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)} · Radius: {radius}m
        </p>
      </div>
    </div>
  );
}
