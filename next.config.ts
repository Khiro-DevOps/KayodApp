import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/applications", destination: "/applicant/applications", permanent: false },
      { source: "/jobs", destination: "/applicant/jobs", permanent: false },
      { source: "/resume", destination: "/applicant/resume", permanent: false },
      { source: "/resume/create", destination: "/applicant/resume/create", permanent: false },
      { source: "/profile", destination: "/applicant/profile", permanent: false },
      { source: "/notifications", destination: "/applicant/notifications", permanent: false },
      { source: "/offer-signing", destination: "/applicant/offer-signing", permanent: false },
      { source: "/interviews/thank-you", destination: "/applicant/interviews/thank-you", permanent: false },
      { source: "/interviews", destination: "/applicant/dashboard", permanent: false },
      { source: "/leaves", destination: "/employee/leaves", permanent: false },
      { source: "/leaves/new", destination: "/employee/leaves/new", permanent: false },
      { source: "/schedules", destination: "/employee/schedules", permanent: false },
    ];
  },
};

export default nextConfig;