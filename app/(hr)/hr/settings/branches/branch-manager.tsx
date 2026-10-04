"use client";

import { useState } from "react";
import type { OfficeBranch } from "@/lib/types";
import { createBranchAction, updateBranchAction, deleteBranchAction } from "./branch-actions";

interface BranchManagerProps {
  initialBranches: OfficeBranch[];
}

export default function BranchManager({ initialBranches }: BranchManagerProps) {
  const [branches, setBranches] = useState<OfficeBranch[]>(initialBranches);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<OfficeBranch | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    const formData = new FormData(e.currentTarget);
    try {
      if (editingBranch) {
        formData.append("id", editingBranch.id);
        await updateBranchAction(formData);
      } else {
        await createBranchAction(formData);
      }
      setIsModalOpen(false);
      setEditingBranch(null);
      // Let server revalidation handle the refresh
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to save branch");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this branch?")) return;
    setIsPending(true);
    const formData = new FormData();
    formData.append("id", id);
    try {
      await deleteBranchAction(formData);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to delete branch");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
          onClick={() => {
            setEditingBranch(null);
            setIsModalOpen(true);
          }}
        >
          + Add Branch
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border shadow-sm">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-surface-bg border-b border-border text-text-muted">
            <tr>
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Address</th>
              <th className="px-6 py-3 font-medium">Coordinates</th>
              <th className="px-6 py-3 font-medium">Radius (m)</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card-bg">
            {branches.map(branch => (
              <tr key={branch.id} className="hover:bg-surface-bg/50 transition-colors">
                <td className="px-6 py-4 text-text-main font-medium">{branch.name}</td>
                <td className="px-6 py-4 text-text-muted truncate max-w-xs">{branch.address}</td>
                <td className="px-6 py-4 text-text-muted">
                  {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
                </td>
                <td className="px-6 py-4 text-text-muted">{branch.radius_meters}m</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      className="text-primary hover:text-primary-dark text-sm px-2 py-1"
                      onClick={() => {
                        setEditingBranch(branch);
                        setIsModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-600 hover:text-red-700 text-sm px-2 py-1"
                      onClick={() => handleDelete(branch.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                  No branches configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-[90vw] min-w-[320px] sm:w-full max-w-lg bg-white p-6 rounded-2xl shadow-xl mx-auto space-y-4 z-50 text-slate-900">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-h3 text-xl font-bold text-text-main">
                {editingBranch ? "Edit Branch" : "Add Branch"}
              </h3>
              <button
                type="button"
                className="text-text-muted hover:text-text-main"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-text-main">Branch Name</label>
                <input
                  name="name"
                  required
                  defaultValue={editingBranch?.name || ""}
                  placeholder="e.g. Makati HQ"
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-text-main">Address</label>
                <textarea
                  name="address"
                  required
                  defaultValue={editingBranch?.address || ""}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-text-main">Latitude</label>
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBranch?.latitude || ""}
                    className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-text-main">Longitude</label>
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    required
                    defaultValue={editingBranch?.longitude || ""}
                    className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-text-main">Geofence Radius (meters)</label>
                <input
                  name="radius_meters"
                  type="number"
                  required
                  min={1}
                  defaultValue={editingBranch?.radius_meters || 200}
                  className="w-full rounded-lg border border-border bg-surface-bg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:bg-surface-bg"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                >
                  {isPending ? "Saving..." : "Save Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
