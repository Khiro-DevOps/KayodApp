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
    <div className="fixed inset-0 z-50 bg-black/40 p-0 sm:p-6">
      <div className="flex h-full flex-col overflow-hidden bg-white shadow-xl sm:mx-auto sm:max-w-4xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div><h2 className="font-semibold text-text-main">{branch ? "Edit branch" : "Add branch"}</h2><p className="text-xs text-text-muted">Move the map under the fixed pin.</p></div>
          <button type="button" onClick={onClose} className="px-2 text-text-muted">Close</button>
        </div>
        <div className="relative min-h-0 flex-1"><Map latitude={latitude} longitude={longitude} radius={radius} target={target} onLocationChange={(lat, lng, nextAddress) => { setLatitude(lat); setLongitude(lng); if (!address) setAddress(nextAddress); }} /><div className="absolute left-3 right-3 top-3 z-[1001]"><div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Philippine address" className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm shadow" /><button type="button" onClick={() => navigator.geolocation.getCurrentPosition((position) => { const next: [number, number] = [position.coords.latitude, position.coords.longitude]; setTarget(next); setLatitude(next[0]); setLongitude(next[1]); }, () => setError("Location permission was denied."))} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow">Use my location</button></div>{results.length > 0 && <div className="mt-1 overflow-hidden rounded-lg border border-border bg-white shadow">{results.map((result) => <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => { const next: [number, number] = [Number(result.lat), Number(result.lon)]; setTarget(next); setLatitude(next[0]); setLongitude(next[1]); setAddress(result.display_name); setResults([]); setSearch(""); }} className="block w-full border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-surface-bg">{result.display_name}</button>)}</div>}</div></div>
        <div className="space-y-3 border-t border-border bg-white p-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-text-main">Branch name<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-lg border border-border px-3 py-2" /></label>
            <label className="text-sm text-text-main">Address<input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-3 py-2" /></label>
          </div>
          <label className="block text-sm text-text-main">Radius: {radius} m<input type="range" min={20} max={5000} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full" /></label>
          <div className="flex items-center justify-between gap-3"><span className="text-xs text-text-muted">Pin: {latitude.toFixed(6)}, {longitude.toFixed(6)}</span><button type="button" onClick={() => void save()} disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Confirm location"}</button></div>
        </div>
      </div>
    </div>
  );
}
