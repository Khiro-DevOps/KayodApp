"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Resume, Profile } from "@/lib/types";
import ResumeUploadClient from "./resume-upload-client";

interface ResumeBuilderClientProps {
  resumes: Resume[];
  profile: Profile | null;
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

export default function ResumeBuilderClient({ resumes, profile }: ResumeBuilderClientProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedPhone = (() => {
    const profileRecord = (profile ?? {}) as Record<string, unknown>;
    const phone = profileRecord.phone;
    const phoneNumber = profileRecord.phone_number;

    if (typeof phone === "string" && phone.trim().length > 0) return phone.trim();
    if (typeof phoneNumber === "string" && phoneNumber.trim().length > 0) return phoneNumber.trim();
    return "";
  })();

  // Initialize form data with profile information
  const getInitialFormData = (): FormData => ({
    resumeName: "",
    fullName: profile?.first_name && profile?.last_name 
      ? `${profile.first_name} ${profile.last_name}` 
      : "",
    email: profile?.email || "",
    phone: resolvedPhone,
    location: profile?.city && profile?.country 
      ? `${profile.city}, ${profile.country}` 
      : profile?.address || "",
    summary: "",
    experience: "",
    education: "",
    skills: "",
    certifications: "",
  });

  const [formData, setFormData] = useState<FormData>(getInitialFormData);

  useEffect(() => {
    setFormData((current) => {
      const hasStartedTyping =
        current.fullName.trim().length > 0 ||
        current.email.trim().length > 0 ||
        current.phone.trim().length > 0 ||
        current.location.trim().length > 0;

      if (hasStartedTyping) {
        return current;
      }

      return getInitialFormData();
    });
  }, [profile?.id, profile?.first_name, profile?.last_name, profile?.email, resolvedPhone, profile?.city, profile?.country, profile?.address]);

  const handleChange = (field: keyof FormData, value: string) => {
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
        
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
          setShowPreview(true);
        }

        setFormData({
          resumeName: "",
          fullName: "",
          email: "",
          phone: "",
          location: "",
          summary: "",
          experience: "",
          education: "",
          skills: "",
          certifications: "",
        });

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

  const handleViewResume = (resume: Resume) => {
    setSelectedResume(resume);
    if (resume.pdf_url) {
      setPreviewUrl(resume.pdf_url);
      setShowPreview(true);
    }
  };

  return (
    <div className="space-y-3">
      {/* Form Section */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-surface border border-border p-6">
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
              {isLoading ? "Generating with AI..." : "Generate Resume with AI"}
            </button>
          </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
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
                <img
                  src={previewUrl}
                  alt="Resume preview"
                  className="w-full h-auto"
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

      {/* File Upload - At Bottom */}
      <div className="space-y-4 rounded-2xl bg-surface border border-border p-6">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-text-primary">Upload Resume</h2>
          <p className="text-xs text-text-secondary">Or upload an existing resume file instead of creating one</p>
        </div>
        <ResumeUploadClient resumes={resumes} />
      </div>
    </div>
  );
}
