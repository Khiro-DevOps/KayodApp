const DEFAULT_RESUME_BUCKET_NAME = "resumes";

export function getResumeBucketName() {
  const configuredName = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_NAME?.trim();
  return configuredName || DEFAULT_RESUME_BUCKET_NAME;
}

function getPublicObjectPrefix(bucketName: string) {
  return `/storage/v1/object/public/${bucketName}/`;
}

export function getObjectPathFromPublicUrl(publicUrl: string, bucketName: string) {
  try {
    const url = new URL(publicUrl);
    const prefix = getPublicObjectPrefix(bucketName);

    if (!url.pathname.startsWith(prefix)) {
      return null;
    }

    // Decodes the URL to get the actual file path (handles spaces/special chars)
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}