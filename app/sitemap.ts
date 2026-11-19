import type { MetadataRoute } from "next";

import { getAppUrl } from "@/lib/public-jobs";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: getAppUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: getAppUrl("/jobs"), changeFrequency: "daily", priority: 0.9 },
    { url: getAppUrl("/login"), changeFrequency: "monthly", priority: 0.3 },
    { url: getAppUrl("/register/applicant"), changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = await createClient();
    const { data: jobs } = await supabase
      .from("public_job_postings")
      .select("id, published_at")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(500)
      .returns<Array<{ id: string; published_at: string | null }>>();

    const jobRoutes: MetadataRoute.Sitemap = (jobs ?? []).map((job) => ({
      url: getAppUrl(`/jobs/${job.id}`),
      lastModified: job.published_at ?? undefined,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    return [...staticRoutes, ...jobRoutes];
  } catch {
    return staticRoutes;
  }
}
