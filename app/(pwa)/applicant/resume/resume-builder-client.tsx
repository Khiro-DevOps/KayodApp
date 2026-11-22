"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Resume, Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { PH_CITIES, PH_PROVINCES } from "@/lib/ph-locations";
import type { ResumePrefill } from "./resume-builder-modal";

interface ResumeBuilderClientProps {
  resumes: Resume[];
  profile: Profile | null;
  prefill?: ResumePrefill;
}

interface FormData {
  resumeName: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  certifications: string;
}

type ProfileApiResponse = {
  profile?: (Partial<Profile> & {
    province?: string | null;
    phone_number?: string | null;
  }) | null;
};

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatHandleAsName(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupCityName(cityId: unknown): string {
  const id = normalizeName(cityId);
  if (!id) return "";
  return PH_CITIES.find((c) => c.id === id)?.name ?? "";
}

function lookupProvinceName(provinceId: unknown): string {
  const id = normalizeName(provinceId);
  if (!id) return "";
  return PH_PROVINCES.find((p) => p.id === id)?.name ?? "";
}

function deriveFullName(
  profileLike: Partial<Profile> | null,
  userLike?: { email?: string | null; user_metadata?: unknown; raw_user_meta_data?: unknown },
  prefill?: ResumePrefill
): string {
  if (prefill?.fullName?.trim()) return prefill.fullName.trim();

  const explicitFull = normalizeName(profileLike?.full_name);
  if (explicitFull) return explicitFull;

  const firstName = normalizeName(profileLike?.first_name);
  const lastName = normalizeName(profileLike?.last_name);
  const profileFullName = `${firstName} ${lastName}`.trim();
  if (profileFullName) return profileFullName;

  const metadata = (userLike?.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (userLike?.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const metadataFirstName = normalizeName(metadata.first_name ?? rawMetadata.first_name);
  const metadataLastName = normalizeName(metadata.last_name ?? rawMetadata.last_name);
  const metadataName = `${metadataFirstName} ${metadataLastName}`.trim();
  if (metadataName) return metadataName;

  const fullName = normalizeName(metadata.full_name ?? rawMetadata.full_name ?? metadata.name ?? rawMetadata.name);
  if (fullName) return fullName;

  const emailLocalPart = ((profileLike?.email ?? userLike?.email) ?? "").split("@")[0] ?? "";
  return formatHandleAsName(emailLocalPart);
}

function derivePhone(
  profileLike: Partial<Profile> | null,
  userLike?: { user_metadata?: unknown; raw_user_meta_data?: unknown },
  prefill?: ResumePrefill
): string {
  if (prefill?.phone?.trim()) return prefill.phone.trim();

  const profileRecord = (profileLike ?? {}) as Record<string, unknown>;
  const profilePhone = profileRecord.phone;
  const profilePhoneNumber = profileRecord.phone_number;

  if (typeof profilePhone === "string" && profilePhone.trim().length > 0) return profilePhone.trim();
  if (typeof profilePhoneNumber === "string" && profilePhoneNumber.trim().length > 0) return profilePhoneNumber.trim();

  const metadata = (userLike?.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (userLike?.raw_user_meta_data ?? {}) as Record<string, unknown>;
  const authPhone = metadata.phone ?? metadata.phone_number ?? rawMetadata.phone ?? rawMetadata.phone_number;

  return typeof authPhone === "string" ? authPhone.trim() : "";
}

function buildLocation(
  profileLike: (Partial<Profile> & { province?: string | null }) | null,
  userLike?: { user_metadata?: unknown; raw_user_meta_data?: unknown },
  prefill?: ResumePrefill
): string {
  if (prefill?.location?.trim()) return prefill.location.trim();

  const metadata = (userLike?.user_metadata ?? {}) as Record<string, unknown>;
  const rawMetadata = (userLike?.raw_user_meta_data ?? {}) as Record<string, unknown>;

  const address = normalizeName(profileLike?.address ?? metadata.address ?? rawMetadata.address);
  const city =
    normalizeName(profileLike?.city ?? metadata.city ?? rawMetadata.city) ||
    lookupCityName(profileLike?.city_id ?? metadata.city_id ?? rawMetadata.city_id);
  const province =
    normalizeName(profileLike?.province ?? metadata.province ?? rawMetadata.province) ||
    lookupProvinceName(profileLike?.province_id ?? metadata.province_id ?? rawMetadata.province_id);
  const country = normalizeName(profileLike?.country ?? metadata.country ?? rawMetadata.country);

  if (city && province) return `${city}, ${province}`;
  if (city && country) return `${city}, ${country}`;
  if (address && city) return `${address}, ${city}`;
  if (address && province) return `${address}, ${province}`;
  if (province && country) return `${province}, ${country}`;
  return address || city || province || country;
}

export default function ResumeBuilderClient({ profile, prefill }: ResumeBuilderClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personalInfoDirty, setPersonalInfoDirty] = useState(false);

  const resolvePrefillDefaults = useCallback(
    (
      overrideProfile?: (Partial<Profile> & { province?: string | null }) | null,
      overrideUser?: { email?: string | null; user_metadata?: unknown; raw_user_meta_data?: unknown } | null
    ) => {
      const activeProfile = overrideProfile ?? profile;
      return {
        fullName: deriveFullName(activeProfile, overrideUser ?? undefined, prefill),
        email:
          prefill?.email?.trim() ||
          normalizeName(activeProfile?.email) ||
          normalizeName(overrideUser?.email) ||
          "",
        phone: derivePhone(activeProfile, overrideUser ?? undefined, prefill),
        location: buildLocation(activeProfile, overrideUser ?? undefined, prefill),
      };
    },
    [profile, prefill]
  );

  const getInitialFormData = useCallback((): FormData => {
    const defaults = resolvePrefillDefaults();
    return {
      resumeName: "",
      fullName: defaults.fullName,
      email: defaults.email,
      phone: defaults.phone,
      location: defaults.location,
      summary: "",
      experience: "",
      education: "",
      skills: "",
      certifications: "",
    };
  }, [resolvePrefillDefaults]);

  const [formData, setFormData] = useState<FormData>(() => getInitialFormData());

  const resetForm = useCallback(() => {
    const defaults = resolvePrefillDefaults();
    setPersonalInfoDirty(false);
    setError(null);
    setFormData((prev) => ({
      resumeName: "",
      fullName: defaults.fullName || prev.fullName,
      email: defaults.email || prev.email,
      phone: defaults.phone || prev.phone,
      location: defaults.location || prev.location,
      summary: "",
      experience: "",
      education: "",
      skills: "",
      certifications: "",
    }));
  }, [resolvePrefillDefaults]);

  // Sync personal info immediately if server prefill/profile props update.
  useEffect(() => {
    const defaults = resolvePrefillDefaults();
    setFormData((current) => {
      if (personalInfoDirty) {
        return {
          ...current,
          fullName: current.fullName || defaults.fullName,
          email: current.email || defaults.email,
          phone: current.phone || defaults.phone,
          location: current.location || defaults.location,
        };
      }
      return {
        ...current,
        fullName: defaults.fullName || current.fullName,
        email: defaults.email || current.email,
        phone: defaults.phone || current.phone,
        location: defaults.location || current.location,
      };
    });
  }, [resolvePrefillDefaults, personalInfoDirty]);

  useEffect(() => {
    let isMounted = true;

    const hydratePersonalInfo = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user as {
        email?: string | null;
        user_metadata?: unknown;
        raw_user_meta_data?: unknown;
      } | null;

      if (!isMounted || !user) return;

      let fetchedProfile: (Partial<Profile> & { province?: string | null }) | null = null;
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as ProfileApiResponse;
          fetchedProfile = payload.profile ?? null;
        }
      } catch {
        // Keep server-provided fallback values if profile fetch fails.
      }

      if (!isMounted) return;

      const mergedProfile: (Partial<Profile> & { province?: string | null }) = {
        ...(profile ?? {}),
        ...(fetchedProfile ?? {}),
        first_name: normalizeName(fetchedProfile?.first_name) || normalizeName(profile?.first_name),
        last_name: normalizeName(fetchedProfile?.last_name) || normalizeName(profile?.last_name),
        email: normalizeName(fetchedProfile?.email) || normalizeName(profile?.email) || normalizeName(user.email),
        phone: normalizeName(fetchedProfile?.phone) || normalizeName(profile?.phone),
        address: normalizeName(fetchedProfile?.address) || normalizeName(profile?.address) || null,
        city: normalizeName(fetchedProfile?.city) || normalizeName(profile?.city) || null,
        country: normalizeName(fetchedProfile?.country) || normalizeName(profile?.country) || "Philippines",
        city_id: fetchedProfile?.city_id ?? profile?.city_id ?? null,
        province_id: fetchedProfile?.province_id ?? profile?.province_id ?? null,
      };

      const defaults = resolvePrefillDefaults(mergedProfile, user);

      setFormData((current) => {
        if (personalInfoDirty) {
          return {
            ...current,
            fullName: current.fullName || defaults.fullName,
            email: current.email || defaults.email,
            phone: current.phone || defaults.phone,
            location: current.location || defaults.location,
          };
        }

        return {
          ...current,
          fullName: defaults.fullName || current.fullName,
          email: defaults.email || current.email,
          phone: defaults.phone || current.phone,
          location: defaults.location || current.location,
        };
      });
    };

    void hydratePersonalInfo();

    return () => {
      isMounted = false;
    };
  }, [profile, resolvePrefillDefaults, personalInfoDirty, supabase.auth]);

  const handleChange = (field: keyof FormData, value: string) => {
    if (field === "fullName" || field === "email" || field === "phone" || field === "location") {
      setPersonalInfoDirty(true);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!formData.resumeName.trim()) {
        setError("Please give your resume a name");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/create-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.pdfUrl) {
          setPreviewUrl(data.pdfUrl);
          setShowPreview(true);
          window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
        } else if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
          setShowPreview(true);
        }

        resetForm();

        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create resume. Please try again.");
      }
    } catch (error) {
      console.error("Error creating resume:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Form Section */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-card-bg border border-border p-6">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Resume Name */}
            <div className="space-y-1">
              <label htmlFor="resumeName" className="text-sm font-medium text-text-primary">
                Resume Name *
              </label>
              <input
                id="resumeName"
                type="text"
                required
                value={formData.resumeName}
                onChange={(e) => handleChange("resumeName", e.target.value)}
                placeholder="e.g., Senior Developer Resume"
                className="w-full rounded-xl border border-border px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Personal Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Personal Information</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="fullName" className="text-xs font-medium text-text-secondary">
                    Full Name *
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => handleChange("fullName", e.target.value)}
                    placeholder="Juan Dela Cruz"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="email" className="text-xs font-medium text-text-secondary">
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="juan@example.com"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="phone" className="text-xs font-medium text-text-secondary">
                    Phone *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+63 912 345 6789"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="location" className="text-xs font-medium text-text-secondary">
                    Location *
                  </label>
                  <input
                    id="location"
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    placeholder="Manila, Philippines"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Professional Summary */}
            <div className="space-y-1">
              <label htmlFor="summary" className="text-xs font-medium text-text-secondary">
                Professional Summary *
              </label>
              <textarea
                id="summary"
                required
                rows={2}
                value={formData.summary}
                onChange={(e) => handleChange("summary", e.target.value)}
                placeholder="Brief overview of your professional background and career goals..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Work Experience */}
            <div className="space-y-1">
              <label htmlFor="experience" className="text-xs font-medium text-text-secondary">
                Work Experience *
              </label>
              <textarea
                id="experience"
                required
                rows={3}
                value={formData.experience}
                onChange={(e) => handleChange("experience", e.target.value)}
                placeholder="Job Title | Company | Start Date - End Date&#10;Key responsibilities and achievements..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Education */}
            <div className="space-y-1">
              <label htmlFor="education" className="text-xs font-medium text-text-secondary">
                Education *
              </label>
              <textarea
                id="education"
                required
                rows={2}
                value={formData.education}
                onChange={(e) => handleChange("education", e.target.value)}
                placeholder="Degree | Institution | Year&#10;e.g., Bachelor of Science in Computer Science | University of the Philippines | 2020"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Skills */}
            <div className="space-y-1">
              <label htmlFor="skills" className="text-xs font-medium text-text-secondary">
                Skills * (comma separated)
              </label>
              <textarea
                id="skills"
                required
                rows={2}
                value={formData.skills}
                onChange={(e) => handleChange("skills", e.target.value)}
                placeholder="JavaScript, React, Node.js, TypeScript, Python..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* Certifications */}
            <div className="space-y-1">
              <label htmlFor="certifications" className="text-xs font-medium text-text-secondary">
                Certifications (comma separated, optional)
              </label>
              <textarea
                id="certifications"
                rows={2}
                value={formData.certifications}
                onChange={(e) => handleChange("certifications", e.target.value)}
                placeholder="AWS Solutions Architect, Google Cloud Associate..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {isLoading ? "Creating resume..." : "Create resume"}
            </button>
          </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-text-primary">Resume Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {previewUrl && (
              <div className="border border-border rounded-xl overflow-hidden bg-gray-50">
                <iframe
                  src={previewUrl}
                  className="w-full h-[70vh]"
                  title="Generated resume preview"
                />
              </div>
            )}

            <button
              onClick={() => setShowPreview(false)}
              className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
