"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageContainer from "@/components/ui/page-container";
import Link from "next/link";

export default function CreateResumePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/create-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push("/resume");
      } else {
        alert("Failed to create resume. Please try again.");
      }
    } catch (error) {
      console.error("Error creating resume:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-gray-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
            </svg>
          </Link>
          <h1 className="font-(family-name:--font-heading) text-xl font-bold text-text-primary">
            Create AI Resume
          </h1>
        </div>

        <p className="text-sm text-text-secondary">
          Fill in your information below and our AI will create a professional resume for you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Personal Information</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="fullName" className="text-sm font-medium text-text-primary">
                  Full Name *
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => handleChange("fullName", e.target.value)}
                  placeholder="Juan Dela Cruz"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium text-text-primary">
                  Email *
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="juan@example.com"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="phone" className="text-sm font-medium text-text-primary">
                  Phone *
                </label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="+63 912 345 6789"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="location" className="text-sm font-medium text-text-primary">
                  Location *
                </label>
                <input
                  id="location"
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                  placeholder="Manila, Philippines"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          <div className="space-y-1">
            <label htmlFor="summary" className="text-sm font-medium text-text-primary">
              Professional Summary *
            </label>
            <textarea
              id="summary"
              required
              rows={3}
              value={formData.summary}
              onChange={(e) => handleChange("summary", e.target.value)}
              placeholder="Brief overview of your professional background and career goals..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Work Experience */}
          <div className="space-y-1">
            <label htmlFor="experience" className="text-sm font-medium text-text-primary">
              Work Experience *
            </label>
            <textarea
              id="experience"
              required
              rows={4}
              value={formData.experience}
              onChange={(e) => handleChange("experience", e.target.value)}
              placeholder="List your work experience with job titles, companies, dates, and key responsibilities..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Education */}
          <div className="space-y-1">
            <label htmlFor="education" className="text-sm font-medium text-text-primary">
              Education *
            </label>
            <textarea
              id="education"
              required
              rows={3}
              value={formData.education}
              onChange={(e) => handleChange("education", e.target.value)}
              placeholder="List your educational background, degrees, institutions, and graduation dates..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Skills */}
          <div className="space-y-1">
            <label htmlFor="skills" className="text-sm font-medium text-text-primary">
              Skills *
            </label>
            <textarea
              id="skills"
              required
              rows={2}
              value={formData.skills}
              onChange={(e) => handleChange("skills", e.target.value)}
              placeholder="List your technical and soft skills (e.g. JavaScript, React, Communication, Leadership)..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Certifications */}
          <div className="space-y-1">
            <label htmlFor="certifications" className="text-sm font-medium text-text-primary">
              Certifications (Optional)
            </label>
            <textarea
              id="certifications"
              rows={2}
              value={formData.certifications}
              onChange={(e) => handleChange("certifications", e.target.value)}
              placeholder="List any relevant certifications, licenses, or professional development..."
              className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-2xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating Resume..." : "Create AI Resume"}
          </button>
        </form>
      </div>
    </PageContainer>
  );
}