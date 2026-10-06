"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { OfficeBranch } from "@/lib/types";
import { createBranchAction, updateBranchAction } from "./branch-actions";

const Map = dynamic(() => import("./branch-map"), { ssr: false });

interface Props {
  branch: OfficeBranch | null;
  onClose: () => void;
}

export default function BranchMapPicker({ branch, onClose }: Props) {
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [latitude, setLatitude] = useState(branch?.latitude ?? 12.8797);
  const [longitude, setLongitude] = useState(branch?.longitude ?? 121.774);
  const [radius, setRadius] = useState(branch?.radius_meters ?? 200);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ lat: string; lon: string; display_name: string }>>([]);
  const [target, setTarget] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (search.trim().length < 3) { setResults([]); return; }
    const timer = window.setTimeout(() => { void fetch(`/api/geocode/search?q=${encodeURIComponent(search.trim())}`).then((response) => response.ok ? response.json() : null).then((data) => setResults(data?.data ?? [])); }, 500);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function save() {
    if (!name.trim()) return setError("Branch name is required");
    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("address", address.trim());
    formData.set("latitude", latitude.toFixed(6));
    formData.set("longitude", longitude.toFixed(6));
    formData.set("radius_meters", String(radius));
    try {
      if (branch) {
        formData.set("id", branch.id);
        await updateBranchAction(formData);
      } else {
        await createBranchAction(formData);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save branch");
      setPending(false);
      return;
    }
    setPending(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden bg-white shadow-xl rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-text-main">{branch ? "Edit branch" : "Add branch"}</h2>
            <p className="text-xs text-text-muted">Move the map under the fixed pin.</p>
          </div>
          <button type="button" onClick={onClose} className="text-error hover:text-red-700 transition-colors flex items-center justify-center p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        
        {/* Map Area */}
        <div className="relative h-[40vh] min-h-[250px] shrink-0 bg-surface-bg">
          <Map 
            latitude={latitude} 
            longitude={longitude} 
            radius={radius} 
            target={target} 
            onLocationChange={(lat, lng, nextAddress) => { 
              setLatitude(lat); 
              setLongitude(lng); 
              // Always auto-fill address when pin is moved
              if (nextAddress) setAddress(nextAddress); 
            }} 
          />
          {/* Search bar shifted right to clear map controls */}
          <div className="absolute left-14 right-3 top-3 z-[1001]">
            <div className="flex gap-2">
              <input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Search Philippine address" 
                className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm shadow focus:outline-none focus:ring-2 focus:ring-primary/50" 
              />
              <button 
                type="button" 
                onClick={() => navigator.geolocation.getCurrentPosition((position) => { 
                  const next: [number, number] = [position.coords.latitude, position.coords.longitude]; 
                  setTarget(next); 
                  setLatitude(next[0]); 
                  setLongitude(next[1]); 
                }, () => setError("Location permission was denied."))} 
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow hover:bg-surface-bg transition-colors"
              >
                Use my location
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-white shadow">
                {results.map((result) => (
                  <button 
                    key={`${result.lat}-${result.lon}`} 
                    type="button" 
                    onClick={() => { 
                      const next: [number, number] = [Number(result.lat), Number(result.lon)]; 
                      setTarget(next); 
                      setLatitude(next[0]); 
                      setLongitude(next[1]); 
                      setAddress(result.display_name); 
                      setResults([]); 
                      setSearch(""); 
                    }} 
                    className="block w-full border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-surface-bg transition-colors"
                  >
                    {result.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Form Area */}
        <div className="flex-1 space-y-4 overflow-y-auto border-t border-border bg-white p-4 sm:p-6">
          {error && <p className="text-sm text-error font-medium">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-text-main font-medium">
              Branch name
              <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </label>
            <label className="text-sm text-text-main font-medium">
              Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </label>
          </div>
          <label className="block text-sm text-text-main font-medium">
            Radius: {radius} m
            <input type="range" min={20} max={5000} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full mt-2 accent-primary" />
          </label>
          
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-text-muted">Pin: {latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
            <button type="button" onClick={() => void save()} disabled={pending} className="rounded-lg bg-primary hover:bg-primary-dark px-6 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors">
              {pending ? "Saving..." : "Confirm location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}