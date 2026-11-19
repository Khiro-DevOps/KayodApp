import type { MetadataRoute } from "next";

import { getAppUrl } from "@/lib/public-jobs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/jobs"],
      disallow: ["/hr", "/employee", "/applicant", "/api", "/dev", "/dev-tools", "/auth"],
    },
    sitemap: getAppUrl("/sitemap.xml"),
  };
}
